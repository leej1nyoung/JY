import { describe, expect, it } from 'vitest';
import { calculateSaju, pillarText, SajuInputError, type SajuChart, type SajuResult } from '../src/index.ts';

const ANDONG = '47170';
const text = (c: SajuChart) => [c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].map((p) => (p ? pillarText(p) : null));
function ok(r: SajuResult) {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`);
  return r;
}
function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof SajuInputError) return e.code;
    throw e;
  }
  return undefined;
}

describe('음력 입력 (한국천문연구원 기준 음력)', () => {
  it('음력 1996-01-05 = 양력 1996-02-23 → 같은 원국', () => {
    const r = ok(calculateSaju({ calendar: 'lunar', year: 1996, month: 1, day: 5, time: { hour: 9, minute: 0 }, birthplaceCode: ANDONG }));
    expect(r.time.solarDate).toBe('1996-02-23');
    expect(r.time.lunarDate).toEqual({ year: 1996, month: 1, day: 5, isLeapMonth: false });
    expect(text(r.chart)).toEqual(['丙子', '庚寅', '庚寅', '庚辰']);
  });
  it('윤달: 음력 2020 윤4월 1일 = 양력 2020-05-23', () => {
    const r = ok(calculateSaju({ calendar: 'lunar', year: 2020, month: 4, day: 1, isLeapMonth: true, time: null, birthplaceCode: ANDONG }));
    expect(r.time.solarDate).toBe('2020-05-23');
  });
  it('한국 음력 윤달(2017 윤5월)을 따른다 — 중국 음력은 윤6월', () => {
    const r = ok(calculateSaju({ calendar: 'lunar', year: 2017, month: 5, day: 1, isLeapMonth: true, time: null, birthplaceCode: ANDONG }));
    expect(r.time.solarDate).toBe('2017-06-24');
    expect(errorCode(() => calculateSaju({ calendar: 'lunar', year: 2017, month: 6, day: 1, isLeapMonth: true, time: null, birthplaceCode: ANDONG })))
      .toBe('INVALID_LEAP_MONTH');
  });
  it('없는 윤달·없는 날짜는 거부', () => {
    expect(errorCode(() => calculateSaju({ calendar: 'lunar', year: 2021, month: 4, day: 1, isLeapMonth: true, time: null, birthplaceCode: ANDONG })))
      .toBe('INVALID_LEAP_MONTH');
    expect(errorCode(() => calculateSaju({ calendar: 'lunar', year: 2021, month: 1, day: 31, time: null, birthplaceCode: ANDONG })))
      .toBe('INVALID_LUNAR_DATE');
  });
});

describe('태어난 시간 모름', () => {
  it('시주 없이 6글자, 일간 제외 5글자에 십신', () => {
    const r = ok(calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 23, time: null, birthplaceCode: ANDONG }));
    expect(text(r.chart)).toEqual(['丙子', '庚寅', '庚寅', null]);
    expect(r.chart.glyphs).toHaveLength(6);
    expect(r.chart.glyphs.filter((g) => g.tenGod !== null)).toHaveLength(5);
    expect(r.notices.map((n) => n.code)).toEqual(['HOUR_UNKNOWN']);
  });
  it('입춘 당일 출생이면 연주·월주를 정할 수 없어 두 후보를 돌려준다', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 4, time: null, birthplaceCode: ANDONG });
    if (r.status !== 'needs_time') throw new Error('expected needs_time');
    expect(r.reason).toBe('YEAR_BOUNDARY');
    expect(r.boundary).toMatchObject({ name: '입춘', korea: '1996-02-04 22:08' });
    expect(text(r.candidates.before)).toEqual(['乙亥', '己丑', pillarText(r.candidates.after.pillars.day), null]);
    expect(text(r.candidates.after).slice(0, 2)).toEqual(['丙子', '庚寅']);
  });
  it('경칩 당일 출생이면 월주만 미정', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1996, month: 3, day: 5, time: null, birthplaceCode: ANDONG });
    if (r.status !== 'needs_time') throw new Error('expected needs_time');
    expect(r.reason).toBe('MONTH_BOUNDARY');
    expect(pillarText(r.candidates.before.pillars.month)).toBe('庚寅');
    expect(pillarText(r.candidates.after.pillars.month)).toBe('辛卯');
  });
});

describe('입력 검증', () => {
  const base = { calendar: 'solar' as const, year: 1996, month: 2, day: 23, time: { hour: 9, minute: 0 }, birthplaceCode: ANDONG };
  it('존재하지 않는 날짜', () => expect(errorCode(() => calculateSaju({ ...base, month: 2, day: 30 }))).toBe('INVALID_DATE'));
  it('지원 범위 밖', () => expect(errorCode(() => calculateSaju({ ...base, year: 1919 }))).toBe('OUT_OF_RANGE'));
  it('해외·미등록 출생지', () => expect(errorCode(() => calculateSaju({ ...base, birthplaceCode: 'TOKYO' }))).toBe('UNKNOWN_BIRTHPLACE'));
  it('잘못된 시각', () => expect(errorCode(() => calculateSaju({ ...base, time: { hour: 24, minute: 0 } }))).toBe('INVALID_TIME'));
  it('양력에 윤달 지정', () => expect(errorCode(() => calculateSaju({ ...base, isLeapMonth: true }))).toBe('LEAP_ON_SOLAR'));
});
