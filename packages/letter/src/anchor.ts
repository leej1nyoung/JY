// 편지가 짚는 "그 시점"과 계절 디테일에 쓸 달을 고른다.
//
// 시점은 사람마다 달라야 한다. 그래서 일간·세운이 아니라 그 사람의 일지(日支)와 기간 안 월운의 월지(月支)
// 관계로 정한다. (세운 천간과 같은 기운의 달을 쓰면 일간과 무관하게 모두 같은 달이 잡힌다 — 실측 54%가 6월.)
//  1. clash  : 월지가 일지와 충(沖)하는 달 — 子午·丑未·寅申·卯酉·辰戌·巳亥. "마음이 제일 흔들렸던 달"
//  2. combine: 월지가 일지와 합(合)하는 달 — 子丑·寅亥·卯戌·辰酉·巳申·午未. "마음이 좀 놓였던 달"
//  3. ipchun : 기간 안에 입춘(세운이 바뀌는 날)이 있으면 그 무렵
//  4. none   : 시점 없이
// 월운은 절입 기준으로 나눈 달이며, 기간과 15일 이상 겹치는 달만 본다.
// 육충·육합은 명리의 표준 관계이고, "흔들림/편안함"으로 읽는 것은 이 서비스의 해석이다.
import {
  branchIndex, ipchunUtc, jieOfYear, koreaCivilToUtc,
  type Branch, type CivilDate,
} from '@naite/saju';

const DAY = 86_400_000;
const MIN_OVERLAP_DAYS = 15;

export interface MonthBranch {
  /** 절입일의 양력 달 (1~12) */
  month: number;
  branch: Branch;
  startUtc: number;
  overlapDays: number;
}

export type Anchor =
  | { kind: 'clash' | 'combine'; month: number }
  | { kind: 'ipchun'; month: 2 }
  | { kind: 'none' };

function kstMonth(utcMs: number): number {
  return new Date(utcMs + 9 * 3600_000).getUTCMonth() + 1;
}

function periodUtc(from: CivilDate, to: CivilDate): [number, number] {
  return [koreaCivilToUtc({ ...from, hour: 0, minute: 0 }).utcMs, koreaCivilToUtc({ ...to, hour: 0, minute: 0 }).utcMs];
}

/** 기간과 15일 이상 겹치는 월운(절입 기준 달) 목록 */
export function monthBranches(from: CivilDate, to: CivilDate): MonthBranch[] {
  const [start, end] = periodUtc(from, to);
  const jies = [];
  for (let y = from.year - 1; y <= to.year + 1; y++) jies.push(...jieOfYear(y));
  jies.sort((a, b) => a.utcMs - b.utcMs);
  const out: MonthBranch[] = [];
  for (let i = 0; i < jies.length - 1; i++) {
    const overlapDays = (Math.min(jies[i + 1]!.utcMs, end) - Math.max(jies[i]!.utcMs, start)) / DAY;
    if (overlapDays < MIN_OVERLAP_DAYS) continue;
    out.push({ month: kstMonth(jies[i]!.utcMs), branch: jies[i]!.branch, startUtc: jies[i]!.utcMs, overlapDays });
  }
  return out;
}

export function isClash(a: Branch, b: Branch): boolean {
  return Math.abs(branchIndex(a) - branchIndex(b)) === 6;
}
/** 육합: 子丑 寅亥 卯戌 辰酉 巳申 午未 — 지지 번호 합이 12로 나눠 1이 남는 짝 */
export function isCombine(a: Branch, b: Branch): boolean {
  return (branchIndex(a) + branchIndex(b)) % 12 === 1;
}

export function chooseAnchor(dayBranch: Branch, from: CivilDate, to: CivilDate): Anchor {
  const months = monthBranches(from, to);
  const clash = months.find((m) => isClash(m.branch, dayBranch));
  if (clash) return { kind: 'clash', month: clash.month };
  const combine = months.find((m) => isCombine(m.branch, dayBranch));
  if (combine) return { kind: 'combine', month: combine.month };

  const [start, end] = periodUtc(from, to);
  for (let y = from.year; y <= to.year; y++) {
    const ip = ipchunUtc(y);
    if (ip - start >= 7 * DAY && end - ip >= 7 * DAY) return { kind: 'ipchun', month: 2 };
  }
  return { kind: 'none' };
}

/** 기간 안에서 15일 이상 들어 있는 양력 달 목록 (계절 디테일 후보) */
export function calendarMonthsIn(from: CivilDate, to: CivilDate): number[] {
  const [start, end] = periodUtc(from, to);
  const out: number[] = [];
  let y = from.year;
  let m = from.month;
  while (y < to.year || (y === to.year && m <= to.month)) {
    const [a] = periodUtc({ year: y, month: m, day: 1 }, { year: y, month: m, day: 1 });
    const next = m === 12 ? { year: y + 1, month: 1, day: 1 } : { year: y, month: m + 1, day: 1 };
    const [b] = periodUtc(next, next);
    if ((Math.min(b, end) - Math.max(a, start)) / DAY >= MIN_OVERLAP_DAYS && !out.includes(m)) out.push(m);
    if (m === 12) {
      y++;
      m = 1;
    } else m++;
  }
  return out;
}
