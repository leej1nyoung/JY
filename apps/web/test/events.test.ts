import { describe, expect, it } from 'vitest';
import { buildFunnel, parseEvent } from '../lib/events';

const ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';

describe('이벤트 검사', () => {
  it('정상 이벤트', () => {
    expect(parseEvent({ visitorId: ID, event: 'pay_click', path: '/letter' })).toEqual({ visitorId: ID, event: 'pay_click', path: '/letter' });
  });
  it('목록에 없는 이벤트, 잘못된 방문 번호는 버린다', () => {
    expect(parseEvent({ visitorId: ID, event: 'hack' })).toBeNull();
    expect(parseEvent({ visitorId: 'abc', event: 'main_view' })).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });
  it('경로는 / 로 시작하는 100자까지만', () => {
    expect(parseEvent({ visitorId: ID, event: 'main_view', path: 'https://x' })!.path).toBe('/');
    expect(parseEvent({ visitorId: ID, event: 'main_view', path: '/' + 'a'.repeat(200) })!.path).toHaveLength(100);
  });
});

describe('퍼널 계산', () => {
  it('단계 순서대로, 앞 단계·첫 단계 대비 비율', () => {
    const rows = buildFunnel([
      { event: 'pay_click', visitors: 3, total: 4 },
      { event: 'main_view', visitors: 20, total: 31 },
      { event: 'write_view', visitors: 12, total: 15 },
      { event: 'letter_created', visitors: 10, total: 10 },
      { event: 'letter_read_end', visitors: 8, total: 9 },
    ]);
    expect(rows.map((r) => [r.event, r.visitors, r.fromPrev, r.fromFirst])).toEqual([
      ['main_view', 20, null, null],
      ['write_view', 12, 60, 60],
      ['letter_created', 10, 83.3, 50],
      ['letter_read_end', 8, 80, 40],
      ['pay_click', 3, 37.5, 15],
    ]);
  });
  it('기록이 없으면 0, 나눌 수 없으면 null', () => {
    const rows = buildFunnel([]);
    expect(rows.every((r) => r.visitors === 0)).toBe(true);
    expect(rows[1]!.fromPrev).toBeNull();
  });
});
