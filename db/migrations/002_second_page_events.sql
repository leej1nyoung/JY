-- 지인 테스트: 두 번째 장 무료 열람과 "990원 낼 만했어?" 답을 기록할 수 있게 이벤트 이름을 늘린다.
-- Supabase SQL Editor 에 그대로 붙여 넣어 실행한다. 여러 번 실행해도 된다.
alter table public.events drop constraint if exists events_event_check;
alter table public.events add constraint events_event_check check (event in (
  'main_view', 'write_view', 'letter_created', 'letter_read_end', 'pay_click',
  'second_page_view', 'worth_yes', 'worth_unsure', 'worth_no'
));
