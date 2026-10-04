import { describe, expect, it } from 'vitest';
import { KOREA_OFFSET_HISTORY } from '../src/data/korea-time.ts';
import { calculateSaju, koreaCivilToUtc, koreaOffsetAt, pillarText, type SajuResult } from '../src/index.ts';

const SEOUL = '11';
const codes = (r: SajuResult) => r.notices.map((n) => n.code);

/** Node(ICU) 의 Asia/Seoul 오프셋(분) — 독립 구현과의 대조용 */
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', timeZoneName: 'longOffset' });
function icuOffset(ms: number): number {
  const v = fmt.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')!.value;
  const m = v.match(/GMT([+-])(\d\d):(\d\d)/)!;
  return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
}

describe('한국 표준시·서머타임 표', () => {
  it('각 전환 시각 직전·직후가 ICU(tzdb) 와 일치', () => {
    for (const p of KOREA_OFFSET_HISTORY.slice(1)) {
      const t = Date.parse(p.fromUtc);
      expect(koreaOffsetAt(t).offsetMinutes, p.fromUtc).toBe(icuOffset(t));
      expect(koreaOffsetAt(t - 60_000).offsetMinutes, p.fromUtc).toBe(icuOffset(t - 60_000));
    }
  });
  it('1912~2050 매일 정오(UTC 03:00)가 ICU 와 일치', () => {
    for (let t = Date.UTC(1912, 0, 1, 3); t < Date.UTC(2051, 0, 1); t += 86_400_000) {
      if (koreaOffsetAt(t).offsetMinutes !== icuOffset(t)) throw new Error(new Date(t).toISOString());
    }
  });
});

describe('벽시계 → UTC', () => {
  it('1987-07-01 12:00 (서머타임, UTC+10) → 02:00Z', () => {
    const c = koreaCivilToUtc({ year: 1987, month: 7, day: 1, hour: 12, minute: 0 });
    expect(new Date(c.utcMs).toISOString()).toBe('1987-07-01T02:00:00.000Z');
    expect(c).toMatchObject({ offsetMinutes: 600, dst: true, resolution: 'unique' });
  });
  it('1955-06-01 12:00 (UTC+8:30 시절 서머타임, UTC+9:30) → 02:30Z', () => {
    const c = koreaCivilToUtc({ year: 1955, month: 6, day: 1, hour: 12, minute: 0 });
    expect(new Date(c.utcMs).toISOString()).toBe('1955-06-01T02:30:00.000Z');
    expect(c.offsetMinutes).toBe(570);
  });
  it('1960-01-01 12:00 (UTC+8:30 표준시) → 03:30Z', () => {
    const c = koreaCivilToUtc({ year: 1960, month: 1, day: 1, hour: 12, minute: 0 });
    expect(new Date(c.utcMs).toISOString()).toBe('1960-01-01T03:30:00.000Z');
  });
  it('시계를 당긴 1987-05-10 02:30 은 없던 시각 → 전환 전(UTC+9) 해석', () => {
    const c = koreaCivilToUtc({ year: 1987, month: 5, day: 10, hour: 2, minute: 30 });
    expect(c.resolution).toBe('gap');
    expect(new Date(c.utcMs).toISOString()).toBe('1987-05-09T17:30:00.000Z');
  });
  it('시계를 되돌린 1987-10-11 02:30 은 두 번 있던 시각 → 앞선 순간(서머타임)', () => {
    const c = koreaCivilToUtc({ year: 1987, month: 10, day: 11, hour: 2, minute: 30 });
    expect(c.resolution).toBe('overlap');
    expect(new Date(c.utcMs).toISOString()).toBe('1987-10-10T16:30:00.000Z');
  });
});

describe('서머타임 출생자의 원국', () => {
  it('1987-07-01 12:00 서울 → 1시간 빼고 경도 보정, 지방시 10:27 → 巳시', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1987, month: 7, day: 1, time: { hour: 12, minute: 0 }, birthplaceCode: SEOUL });
    expect(r.time.localMeanTime).toBe('1987-07-01 10:27');
    expect(r.time.dst).toBe(true);
    expect(codes(r)).toContain('DST_APPLIED');
    if (r.status !== 'ok') throw new Error();
    expect(r.chart.pillars.hour!.branch).toBe('巳');
  });
  it('1960-01-01 12:00 서울 (UTC+8:30) → 지방시 11:57 → 午시, 서머타임 안내 없음', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1960, month: 1, day: 1, time: { hour: 12, minute: 0 }, birthplaceCode: SEOUL });
    expect(r.time.localMeanTime).toBe('1960-01-01 11:57');
    expect(codes(r)).not.toContain('DST_APPLIED');
    if (r.status !== 'ok') throw new Error();
    expect(pillarText(r.chart.pillars.hour!).endsWith('午')).toBe(true);
  });
  it('없던 시각·두 번 있던 시각은 안내', () => {
    const gap = calculateSaju({ calendar: 'solar', year: 1987, month: 5, day: 10, time: { hour: 2, minute: 30 }, birthplaceCode: SEOUL });
    const overlap = calculateSaju({ calendar: 'solar', year: 1987, month: 10, day: 11, time: { hour: 2, minute: 30 }, birthplaceCode: SEOUL });
    expect(codes(gap)).toContain('CLOCK_GAP');
    expect(codes(overlap)).toContain('CLOCK_OVERLAP');
  });
});
