# 3단계 측정 — 구조와 설정 방법

## 무엇을 기록하나 (CLAUDE.md 5-7)

| 이벤트 | 언제 |
|---|---|
| `main_view` | 메인 화면이 열릴 때 |
| `write_view` | 입력 화면이 열릴 때 |
| `letter_created` | 입력을 마치고 편지를 받았을 때 |
| `letter_read_end` | 편지 첫 장 끝(“1 / 2” 표시)이 화면에 보였을 때 |
| `pay_click` | “선물 상자 열어보기 · 990원” 버튼을 눌렀을 때 (결제는 아직 안 됨) |

결제 완료·답장 작성은 4·5단계에서 추가한다.

- 저장하는 값: 무작위 방문 번호(브라우저마다 하나, localStorage), 이벤트 이름, 경로, 시각. **입력한 생년월일·이름·MBTI는 기록하지 않는다.**
- 같은 브라우저는 한 명으로 센다. 시크릿 창이나 다른 기기는 다른 사람으로 잡힌다.
- `/stats` 를 한 번 연 브라우저는 그 뒤로 기록하지 않는다 (운영자 본인 방문 제외).

## 구조

- 브라우저 `lib/track.ts` → `POST /api/events` → `lib/event-store.ts` → Supabase `public.events`
- 집계: Supabase 뷰 `public.event_funnel` → `/stats?key=…`
- Supabase 연결 정보가 없으면 아무것도 저장하지 않고, 사이트는 그대로 동작한다.
- 테이블은 행 수준 보안(RLS)을 켜고 정책을 두지 않아, 공개 키로는 읽기·쓰기가 막혀 있다. 서버만 secret 키로 접근한다.

## 설정 순서 (운영자)

1. **Supabase 프로젝트 만들기**: https://supabase.com 가입 → New project → Region은 `Northeast Asia (Seoul)`.
2. **테이블 만들기**: 왼쪽 메뉴 SQL Editor → `db/migrations/001_events.sql` 내용을 통째로 붙여 넣고 Run.
3. **키 확인**: Project Settings → API Keys.
   - 프로젝트 URL (`https://….supabase.co`)
   - Secret key (`sb_secret_…`). 예전 형식 화면이면 `service_role` 키. **이 키는 외부에 절대 공개하지 않는다.**
4. **Vercel에 넣기**: Vercel 프로젝트 → Settings → Environment Variables에 세 개를 추가하고 다시 배포(Redeploy)한다.
   - `SUPABASE_URL` = 3번의 URL
   - `SUPABASE_SECRET_KEY` = 3번의 secret 키
   - `STATS_KEY` = 아무도 못 맞힐 긴 문자열 (예: 비밀번호 생성기로 만든 32자)
5. **확인**: 배포 주소로 사이트를 한 번 써 본 뒤 `https://배포주소/stats?key=STATS_KEY값` 접속. 단계별 숫자가 보이면 끝.
   - 이 확인 방문은 `/stats` 를 열기 **전에** 하세요. `/stats` 를 연 뒤로는 그 브라우저가 기록에서 빠진다.

## 지인 테스트 끝나면

- `/preview`(문장 검토용)와 테스트 데이터는 정식 런칭 전에 정리한다.
- 개인정보처리방침에 "서비스 개선을 위한 익명 이용 기록(방문 번호·이용 단계·시각)"을 적는다.
