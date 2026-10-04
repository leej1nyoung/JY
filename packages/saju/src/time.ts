// 시각 변환: 한국 현지 시각(서머타임·표준시 변경 포함) → UTC → 출생지 지방평균태양시 / 진태양시.
import * as Astronomy from 'astronomy-engine';
import { KOREA_OFFSET_HISTORY } from './data/korea-time.ts';

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}
export interface CivilDateTime extends CivilDate {
  hour: number;
  minute: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const PERIODS = KOREA_OFFSET_HISTORY.map((p) => ({ ...p, from: Date.parse(p.fromUtc) }));
const DISTINCT_OFFSETS = [...new Set(PERIODS.map((p) => p.offsetMinutes))];

export class TimeRangeError extends Error {}

/** 주어진 UTC 순간의 한국 UTC 오프셋 */
export function koreaOffsetAt(utcMs: number): { offsetMinutes: number; dst: boolean } {
  if (utcMs < PERIODS[0]!.from) throw new TimeRangeError('1912년 이전 한국 시각은 지원하지 않습니다.');
  let found = PERIODS[0]!;
  for (const p of PERIODS) {
    if (p.from <= utcMs) found = p;
    else break;
  }
  return { offsetMinutes: found.offsetMinutes, dst: found.dst };
}

export type ClockResolution = 'unique' | 'overlap' | 'gap';

/**
 * 한국 벽시계 시각 → UTC.
 * 시계를 되돌려 같은 시각이 두 번 있었던 경우(overlap)는 앞선 순간을,
 * 시계를 당겨 존재하지 않는 시각(gap)은 전환 직전 오프셋으로 해석한다.
 * (ECMAScript Temporal 의 'compatible' 규칙과 같다.)
 */
export function koreaCivilToUtc(c: CivilDateTime): {
  utcMs: number;
  offsetMinutes: number;
  dst: boolean;
  resolution: ClockResolution;
} {
  const naive = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);
  const candidates = DISTINCT_OFFSETS.map((o) => naive - o * MINUTE)
    .filter((u) => u >= PERIODS[0]!.from && koreaOffsetAt(u).offsetMinutes * MINUTE === naive - u)
    .sort((a, b) => a - b);
  if (candidates.length > 0) {
    const utcMs = candidates[0]!;
    return { utcMs, ...koreaOffsetAt(utcMs), resolution: candidates.length > 1 ? 'overlap' : 'unique' };
  }
  const before = koreaOffsetAt(naive - 12 * HOUR);
  const utcMs = naive - before.offsetMinutes * MINUTE;
  return { utcMs, ...koreaOffsetAt(utcMs), resolution: 'gap' };
}

/** 지방평균태양시: UTC + 경도 × 4분. 반환값은 "그 지방 시각"을 UTC 필드에 담은 가상의 ms 값. */
export function localMeanTimeMs(utcMs: number, longitude: number): number {
  return utcMs + longitude * 4 * MINUTE;
}

/**
 * 진태양시(균시차 포함). 태양의 시간각을 astronomy-engine 으로 구한다.
 * 반환: 진태양시 ms 값(지방시와 같은 표기 방식)과 균시차(분, 진태양시 − 평균태양시).
 */
export function apparentSolarTime(
  utcMs: number,
  longitude: number,
  latitude: number,
): { ms: number; equationOfTimeMinutes: number } {
  const lmt = localMeanTimeMs(utcMs, longitude);
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const ha = Astronomy.HourAngle(Astronomy.Body.Sun, new Date(utcMs), observer);
  const astHours = (ha + 12) % 24;
  const lmtHours = (((lmt / HOUR) % 24) + 24) % 24;
  let diff = astHours - lmtHours;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  const eotMinutes = diff * 60;
  return { ms: lmt + eotMinutes * MINUTE, equationOfTimeMinutes: eotMinutes };
}

/** 가상 ms 값(UTC 필드 사용)을 날짜·시각으로 */
export function civilFromMs(ms: number): CivilDateTime & { minuteOfDay: number } {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    minuteOfDay: (ms - midnight) / MINUTE,
  };
}

export function isValidCivilDate(c: CivilDate): boolean {
  if (![c.year, c.month, c.day].every(Number.isInteger)) return false;
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day));
  return d.getUTCFullYear() === c.year && d.getUTCMonth() === c.month - 1 && d.getUTCDate() === c.day;
}

export function addDays(c: CivilDate, n: number): CivilDate {
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function formatDate(c: CivilDate): string {
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}
export function formatDateTime(c: CivilDateTime): string {
  return `${formatDate(c)} ${pad(c.hour)}:${pad(c.minute)}`;
}
/** UTC ms → 한국 벽시계 표기 */
export function formatKorea(utcMs: number): string {
  const { offsetMinutes } = koreaOffsetAt(utcMs);
  return formatDateTime(civilFromMs(utcMs + offsetMinutes * MINUTE));
}
