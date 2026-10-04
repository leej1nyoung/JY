import { describe, expect, it } from 'vitest';
import {
  STEMS, calculateSaju, dayPillar, hourBranchOf, hourPillar, monthPillar, pillarText, tenGodOf, yearPillar,
  type SajuResult,
} from '../src/index.ts';

const SEOUL = '11'; // 서울특별시 (구 모름), 동경 126.9917°
const ANDONG = '47170';

function pillars(r: SajuResult) {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`);
  const p = r.chart.pillars;
  return [p.year, p.month, p.day, p.hour].map((x) => (x ? pillarText(x) : null));
}
const codes = (r: SajuResult) => r.notices.map((n) => n.code);

describe('일주 기준일 (CLAUDE.md 5-1)', () => {
  it('2000-01-01 = 戊午일', () => expect(pillarText(dayPillar({ year: 2000, month: 1, day: 1 }))).toBe('戊午'));
  it('1900-01-01 = 甲戌일', () => expect(pillarText(dayPillar({ year: 1900, month: 1, day: 1 }))).toBe('甲戌'));
  it('60일 주기: 2000-01-01 + 60일 = 2000-03-01 도 戊午', () => {
    expect(pillarText(dayPillar({ year: 2000, month: 3, day: 1 }))).toBe('戊午');
    expect(pillarText(dayPillar({ year: 2000, month: 3, day: 2 }))).toBe('己未');
  });
});

describe('연주·월주·시주 공식', () => {
  it('연주: 1984 = 甲子, 1996 = 丙子, 2026 = 丙午', () => {
    expect(pillarText(yearPillar(1984))).toBe('甲子');
    expect(pillarText(yearPillar(1996))).toBe('丙子');
    expect(pillarText(yearPillar(2026))).toBe('丙午');
  });
  it('연두법: 甲己년 丙寅, 乙庚 戊寅, 丙辛 庚寅, 丁壬 壬寅, 戊癸 甲寅', () => {
    expect(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].map((s) => pillarText(monthPillar(s as never, '寅'))))
      .toEqual(['丙寅', '戊寅', '庚寅', '壬寅', '甲寅', '丙寅', '戊寅', '庚寅', '壬寅', '甲寅']);
    expect(pillarText(monthPillar('乙', '丑'))).toBe('己丑'); // 寅부터 11번째
  });
  it('시두법: 甲己일 甲子, 乙庚 丙子, 丙辛 戊子, 丁壬 庚子, 戊癸 壬子', () => {
    expect(['甲', '乙', '丙', '丁', '戊'].map((s) => pillarText(hourPillar(s as never, '子'))))
      .toEqual(['甲子', '丙子', '戊子', '庚子', '壬子']);
    expect(pillarText(hourPillar('庚', '辰'))).toBe('庚辰');
  });
  it('시지 경계: 23:00 子, 00:59 子, 01:00 丑, 07:00 辰, 08:59 辰, 09:00 巳, 22:59 亥', () => {
    const at = (h: number, m: number) => hourBranchOf(h * 60 + m);
    expect([at(23, 0), at(0, 59), at(1, 0), at(7, 0), at(8, 59), at(9, 0), at(22, 59)])
      .toEqual(['子', '子', '丑', '辰', '辰', '巳', '亥']);
  });
});

describe('십신', () => {
  it('일간마다 10개 천간이 10개 십신에 하나씩 대응', () => {
    for (const d of STEMS) expect(new Set(STEMS.map((t) => tenGodOf(d, t))).size).toBe(10);
  });
  it('庚 기준', () => {
    expect(STEMS.map((t) => tenGodOf('庚', t))).toEqual(
      ['편재', '정재', '편관', '정관', '편인', '정인', '비견', '겁재', '식신', '상관'],
    );
  });
});

describe('자시 (밤 11시~자정은 그날 일주 + 다음 날 일간의 子시)', () => {
  it('2000-01-01 23:50 서울 → 지방시 23:17, 일주 戊午 유지, 시주 甲子(다음 날 己未 기준)', () => {
    const r = calculateSaju({ calendar: 'solar', year: 2000, month: 1, day: 1, time: { hour: 23, minute: 50 }, birthplaceCode: SEOUL });
    expect(r.time.localMeanTime).toBe('2000-01-01 23:17');
    expect(pillars(r).slice(2)).toEqual(['戊午', '甲子']);
    expect(codes(r)).toContain('LATE_NIGHT_ZI');
  });
  it('2000-01-02 00:10 서울 → 지방시 전날 23:37(초 단위 23:37:58) 이므로 일주 戊午, 시주 甲子', () => {
    const r = calculateSaju({ calendar: 'solar', year: 2000, month: 1, day: 2, time: { hour: 0, minute: 10 }, birthplaceCode: SEOUL });
    expect(r.time.localMeanTime).toBe('2000-01-01 23:37');
    expect(pillars(r).slice(2)).toEqual(['戊午', '甲子']);
    expect(codes(r)).toContain('LATE_NIGHT_ZI');
  });
  it('2000-01-02 00:40 서울 → 지방시 00:07, 일주 己未, 시주 甲子, 안내 없음', () => {
    const r = calculateSaju({ calendar: 'solar', year: 2000, month: 1, day: 2, time: { hour: 0, minute: 40 }, birthplaceCode: SEOUL });
    expect(pillars(r).slice(2)).toEqual(['己未', '甲子']);
    expect(codes(r)).not.toContain('LATE_NIGHT_ZI');
  });
});

describe('절입 경계 (1996 입춘 = 1996-02-04 22:08 KST)', () => {
  it('22:00 출생 → 아직 乙亥년 己丑월, 절입 근접 안내', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 4, time: { hour: 22, minute: 0 }, birthplaceCode: ANDONG });
    expect(pillars(r).slice(0, 2)).toEqual(['乙亥', '己丑']);
    expect(codes(r)).toContain('NEAR_SOLAR_TERM');
  });
  it('22:30 출생 → 丙子년 庚寅월', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 4, time: { hour: 22, minute: 30 }, birthplaceCode: ANDONG });
    expect(pillars(r).slice(0, 2)).toEqual(['丙子', '庚寅']);
    expect(codes(r)).toContain('NEAR_SOLAR_TERM');
  });
  it('경칩(1996-03-05 16:09) 전후로 월주만 바뀜', () => {
    const before = calculateSaju({ calendar: 'solar', year: 1996, month: 3, day: 5, time: { hour: 16, minute: 0 }, birthplaceCode: ANDONG });
    const after = calculateSaju({ calendar: 'solar', year: 1996, month: 3, day: 5, time: { hour: 16, minute: 20 }, birthplaceCode: ANDONG });
    expect(pillars(before).slice(0, 2)).toEqual(['丙子', '庚寅']);
    expect(pillars(after).slice(0, 2)).toEqual(['丙子', '辛卯']);
  });
});

describe('균시차 경계 안내', () => {
  it('지방시 07:05(辰) 이지만 진태양시로는 06:51(卯)인 경우 안내', () => {
    const r = calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 23, time: { hour: 7, minute: 30 }, birthplaceCode: ANDONG });
    expect(r.time.localMeanTime).toBe('1996-02-23 07:05');
    expect(pillars(r)[3]).toBe('庚辰');
    expect(codes(r)).toContain('APPARENT_SOLAR_TIME_DIFFERS');
  });
});
