-- 나이테 DB 설계 초안 (PostgreSQL / Supabase). 아직 적용하지 않는다 — 4~5단계에서 마이그레이션으로 확정.
-- CLAUDE.md 11. 작업 원칙의 구조를 전제로 한다:
--   이메일 기준 사용자 1명 / 연도별 편지·답장·MBTI 누적 / 결제 기록 분리 저장 /
--   생일 기준(양력·음력) 필드 / 결제자와 수령자 분리(선물하기 대비)
-- 보관 원칙(CLAUDE.md 6): 사주·편지 데이터(app 스키마)와 결제·계약 기록(commerce 스키마)을 분리한다.
--   사용자가 탈퇴·삭제해도 commerce 기록은 전자상거래법상 5년 보관, app 데이터는 즉시 파기.

create schema if not exists app;
create schema if not exists commerce;

-- ─────────────────────────────────────────────────────────────
-- app: 사람과 편지
-- ─────────────────────────────────────────────────────────────

-- 이메일 하나 = 한 사람. 회원가입 없음, 매직링크로 본인 확인.
create table app.users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  display_name  text,                                   -- 불리고 싶은 이름 (없으면 '너')
  consent_personal_info_at timestamptz not null,        -- 개인정보 수집·이용 동의
  consent_marketing_at     timestamptz,                 -- 광고성 정보 수신 동의 (별도, 선택)
  confirmed_self_and_age_at timestamptz not null,       -- 본인 정보 / 만 14세 이상 확인
  last_active_at timestamptz not null default now(),    -- 2년 미이용 삭제 판단
  deletion_notice_sent_at timestamptz,                  -- 삭제 예정 안내 메일 발송 시각
  created_at    timestamptz not null default now()
);

-- 출생 정보는 사람당 하나. 수정 이력이 필요하면 별도 테이블로 확장.
create table app.birth_profiles (
  user_id        uuid primary key references app.users(id) on delete cascade,
  input_calendar text not null check (input_calendar in ('solar', 'lunar')),
  input_year     int  not null,
  input_month    int  not null,
  input_day      int  not null,
  input_is_leap_month boolean not null default false,
  birth_time     time,                                  -- null = 시간 모름
  birthplace_code text not null,                        -- packages/saju BIRTHPLACES.code
  birthday_basis text not null check (birthday_basis in ('solar', 'lunar')),
  -- 계산 결과 스냅샷 (엔진 버전과 함께 저장해 재현 가능하게)
  saju_snapshot  jsonb not null,
  saju_engine_version text not null,
  updated_at     timestamptz not null default now()
);

-- 연도별 MBTI 기록. 첫해는 입력값, 이듬해부터는 답장 때 재확인한 값.
create table app.mbti_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users(id) on delete cascade,
  cycle_year  int  not null,                            -- 몇 번째 해(1부터)
  mbti        char(4) not null check (mbti ~ '^[EI][NS][TF][JP]$'),
  recorded_at timestamptz not null default now(),
  unique (user_id, cycle_year)
);

-- 편지. 생성된 편지는 반드시 저장하고, 다시 볼 때는 저장본을 보여준다(새로고침으로 재생성 금지).
create table app.letters (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.users(id) on delete cascade,
  cycle_year    int  not null,
  arrives_on    date not null,                          -- 다음 생일 (도착일)
  period_from   date not null,
  period_to     date not null,
  seun_pillar   text not null,                          -- 예: '丙午'
  page1         jsonb not null,                         -- 첫 장 (첫해는 템플릿, 이듬해는 AI 생성분 중 첫 장)
  page1_source  text not null check (page1_source in ('template', 'ai')),
  page2         jsonb,                                  -- 두 번째 장 / 나머지 (결제 후)
  last_wish     text,                                   -- 마지막 당부 한 줄 (이듬해 무료 공개용)
  template_version text,
  ai_model      text,                                   -- 환경변수로 받은 모델명 기록
  ai_prompt_version text,
  generation_status text not null default 'ready'
    check (generation_status in ('ready', 'pending', 'failed', 'refunded')),
  created_at    timestamptz not null default now(),
  unique (user_id, cycle_year)
);

-- 답장 (최대 500자). 위기 신호 감지 결과도 함께 둔다.
create table app.replies (
  id          uuid primary key default gen_random_uuid(),
  letter_id   uuid not null unique references app.letters(id) on delete cascade,
  user_id     uuid not null references app.users(id) on delete cascade,
  body        text not null check (char_length(body) <= 500),
  crisis_flag boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 매직링크 (토큰은 해시만 저장)
create table app.magic_links (
  token_hash  bytea primary key,
  user_id     uuid not null references app.users(id) on delete cascade,
  purpose     text not null check (purpose in ('login', 'letter', 'email_change')),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- commerce: 결제·계약 기록 (사주·편지와 분리, 5년 보관)
-- 개인을 user_id 외래키로 묶지 않는다 — 사용자 삭제 후에도 기록이 남아야 하므로 이메일 사본을 둔다.
-- ─────────────────────────────────────────────────────────────

create table commerce.orders (
  id              uuid primary key default gen_random_uuid(),
  product         text not null check (product in ('first_letter_page2', 'yearly_letter', 'gift')),
  amount_krw      int  not null check (amount_krw > 0),
  -- 결제자와 수령자는 다를 수 있다 (선물하기). 수령자는 선물 수락 전까지 비어 있을 수 있다.
  payer_email     citext not null,
  payer_user_id   uuid,                                 -- app.users.id (FK 없음: 삭제돼도 기록 유지)
  recipient_user_id uuid,                               -- app.users.id
  letter_id       uuid,                                 -- app.letters.id
  status          text not null check (status in ('pending', 'paid', 'cancelled', 'refunded', 'failed')),
  pg_provider     text not null,                        -- 예: 'tosspayments'
  pg_payment_key  text unique,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  refund_reason   text,                                 -- 'ai_generation_failed', 'minor_cancel', 'withdrawal' 등
  created_at      timestamptz not null default now()
);

-- 선물하기 (정식 런칭). 선물하는 사람은 받는 사람 정보를 입력하지 않는다.
create table commerce.gifts (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references commerce.orders(id),
  envelope_message text check (char_length(envelope_message) <= 200),
  deliver_at      timestamptz,                          -- 예약 전송 (null = 즉시)
  expires_at      timestamptz not null,                 -- 유효기간 (표준약관 확인 후 확정)
  redeemed_at     timestamptz,
  redeemed_user_id uuid,
  created_at      timestamptz not null default now()
);

-- 소비자 불만·분쟁 처리 기록 (3년 보관)
create table commerce.disputes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references commerce.orders(id),
  contact_email citext not null,
  summary     text not null,
  resolution  text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
