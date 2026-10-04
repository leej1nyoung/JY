// 12절(節) 절입 시각. 태양의 겉보기 황경이 해당 각도에 도달하는 순간을 astronomy-engine 으로 찾는다.
// (직접 근사식을 쓰지 않는다. astronomy-engine 은 VSOP87 기반, 황경 오차 약 1각분 이내 = 시각 오차 약 30초 이내)
import * as Astronomy from 'astronomy-engine';
import type { Branch } from './constants.ts';

export interface JieDef {
  name: string;
  /** 태양 겉보기 황경(°) */
  longitude: number;
  /** 이 절부터 시작되는 월지 */
  branch: Branch;
  /** 그레고리력 기준 대략 날짜 (검색 시작점용) */
  approx: [month: number, day: number];
}

/** 그레고리력 한 해 안의 순서 (소한 → 대설) */
export const JIE: readonly JieDef[] = [
  { name: '소한', longitude: 285, branch: '丑', approx: [1, 6] },
  { name: '입춘', longitude: 315, branch: '寅', approx: [2, 4] },
  { name: '경칩', longitude: 345, branch: '卯', approx: [3, 6] },
  { name: '청명', longitude: 15, branch: '辰', approx: [4, 5] },
  { name: '입하', longitude: 45, branch: '巳', approx: [5, 6] },
  { name: '망종', longitude: 75, branch: '午', approx: [6, 6] },
  { name: '소서', longitude: 105, branch: '未', approx: [7, 7] },
  { name: '입추', longitude: 135, branch: '申', approx: [8, 8] },
  { name: '백로', longitude: 165, branch: '酉', approx: [9, 8] },
  { name: '한로', longitude: 195, branch: '戌', approx: [10, 8] },
  { name: '입동', longitude: 225, branch: '亥', approx: [11, 7] },
  { name: '대설', longitude: 255, branch: '子', approx: [12, 7] },
];

export interface JieEvent {
  name: string;
  branch: Branch;
  utcMs: number;
}

const cache = new Map<number, JieEvent[]>();

/** 그레고리력 year 년에 드는 12절 (UTC 순간) */
export function jieOfYear(year: number): JieEvent[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const events = JIE.map((j) => {
    const start = Astronomy.MakeTime(new Date(Date.UTC(year, j.approx[0] - 1, j.approx[1] - 10)));
    const t = Astronomy.SearchSunLongitude(j.longitude, start, 20);
    if (!t) throw new Error(`절기 검색 실패: ${year} ${j.name}`);
    return { name: j.name, branch: j.branch, utcMs: t.date.getTime() };
  });
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.utcMs <= events[i - 1]!.utcMs) throw new Error(`절기 순서 오류: ${year}`);
  }
  cache.set(year, events);
  return events;
}

/** 입춘 순간 (UTC ms) */
export function ipchunUtc(year: number): number {
  return jieOfYear(year)[1]!.utcMs;
}

/** utcMs 직전(같거나 이전)의 절과 다음 절 */
export function surroundingJie(utcMs: number): { prev: JieEvent; next: JieEvent } {
  const y = new Date(utcMs).getUTCFullYear();
  const all = [...jieOfYear(y - 1), ...jieOfYear(y), ...jieOfYear(y + 1)];
  let i = all.findIndex((e) => e.utcMs > utcMs);
  if (i <= 0) throw new Error('절기 범위 계산 오류');
  return { prev: all[i - 1]!, next: all[i]! };
}

/** 입춘 기준 사주 연도 */
export function sajuYearAt(utcMs: number): number {
  // 입춘은 항상 2월 초이므로 UTC 연도와 한국 연도의 차이(1월 1일 전후 9시간)는 판정에 영향이 없다.
  const y = new Date(utcMs).getUTCFullYear();
  return utcMs >= ipchunUtc(y) ? y : y - 1;
}
