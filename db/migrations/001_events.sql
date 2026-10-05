-- 3단계 측정 이벤트 (CLAUDE.md 5-7). Supabase SQL Editor 에 그대로 붙여 넣어 실행한다.
-- 개인정보 없음: 무작위 방문 번호(브라우저별), 이벤트 이름, 경로, 시각만 저장한다.

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  visitor_id uuid not null,
  event      text not null check (event in ('main_view', 'write_view', 'letter_created', 'letter_read_end', 'pay_click')),
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists events_event_idx on public.events (event);

-- 행 수준 보안을 켜고 정책을 두지 않는다 → 공개 키(anon)로는 읽기·쓰기 모두 불가.
-- 서버만 secret 키로 접근한다.
alter table public.events enable row level security;

-- 퍼널 집계 뷰. security_invoker 로 만들어 호출한 역할의 권한(RLS)을 그대로 따르게 한다.
create or replace view public.event_funnel with (security_invoker = true) as
  select event, count(distinct visitor_id) as visitors, count(*) as total
  from public.events
  group by event;

revoke all on public.events from anon, authenticated;
revoke all on public.event_funnel from anon, authenticated;

-- 서버(secret 키 = service_role)에 필요한 권한을 명시한다.
-- 프로젝트에 따라 public 스키마 새 표에 자동 권한이 붙지 않을 수 있어서 직접 준다. 여러 번 실행해도 된다.
grant usage on schema public to service_role;
grant select, insert on public.events to service_role;
grant select on public.event_funnel to service_role;
