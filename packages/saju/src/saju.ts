// 원국 계산 진입점. 판정 기준과 근거는 docs/saju-engine.md 참고.
//
// 핵심 원칙
// - 연주·월주: 출생 "순간"(UTC)과 절입 "순간"을 비교한다. 절입은 천문 사건이므로 지방시 보정 대상이 아니다.
// - 일주·시주: 출생지 지방평균태양시(경도 보정)로 정한다. 날짜 경계는 지방시 자정.
// - 밤 11시~자정(지방시)은 일주를 그날로 두고(야자시), 시주는 다음 날 일간의 子시를 쓴다.
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { BIRTHPLACES, type Birthplace } from './data/birthplaces.ts';
import {
  buildChart, dayPillar, hourBranchOf, hourPillar, julianDayNumber, monthPillar, yearPillar, type SajuChart,
} from './pillars.ts';
import { sajuYearAt, surroundingJie } from './solar-terms.ts';
import {
  addDays, apparentSolarTime, civilFromMs, formatDate, formatDateTime, formatKorea,
  isValidCivilDate, koreaCivilToUtc, localMeanTimeMs, type CivilDate,
} from './time.ts';
import { sexagenary } from './constants.ts';

export const ENGINE_VERSION = '1.0.0';

/** 지원하는 출생일(양력) 범위. 음력 변환 데이터(KASI 기준)가 2050년까지라 상한을 맞춘다. */
export const SUPPORTED_RANGE = { from: { year: 1920, month: 1, day: 1 }, to: { year: 2050, month: 12, day: 31 } } as const;

/** 절입 시각과 이 분(分) 이내로 가까우면 안내한다. (출생 시각 기록의 반올림·만세력 간 1~2분 차이를 고려) */
export const NEAR_SOLAR_TERM_MINUTES = 30;

export interface BirthInput {
  calendar: 'solar' | 'lunar';
  year: number;
  month: number;
  day: number;
  /** 음력일 때 윤달 여부 */
  isLeapMonth?: boolean;
  /** 한국 벽시계 시각(당시 서머타임 포함 그대로). 모르면 null */
  time: { hour: number; minute: number } | null;
  /** BIRTHPLACES 의 code */
  birthplaceCode: string;
}

export type NoticeCode =
  | 'LATE_NIGHT_ZI'
  | 'NEAR_SOLAR_TERM'
  | 'APPARENT_SOLAR_TIME_DIFFERS'
  | 'DST_APPLIED'
  | 'CLOCK_OVERLAP'
  | 'CLOCK_GAP'
  | 'HOUR_UNKNOWN';

export interface Notice {
  code: NoticeCode;
  message: string;
}

export interface TimeDetails {
  solarDate: string;
  lunarDate: { year: number; month: number; day: number; isLeapMonth: boolean } | null;
  /** 입력한 벽시계 시각 */
  clock: string | null;
  utc: string | null;
  utcOffsetMinutes: number | null;
  dst: boolean | null;
  birthplace: Birthplace;
  /** 출생지 지방평균태양시 (판정 기준) */
  localMeanTime: string | null;
  /** 진태양시(균시차 포함). 참고용 */
  apparentSolarTime: string | null;
  equationOfTimeMinutes: number | null;
}

interface Base {
  engineVersion: string;
  time: TimeDetails;
  notices: Notice[];
}
export interface SajuOk extends Base {
  status: 'ok';
  chart: SajuChart;
}
/** 시간을 모르는데 출생일 중에 절입(입춘 포함)이 있어 연주·월주를 정할 수 없는 경우 */
export interface SajuNeedsTime extends Base {
  status: 'needs_time';
  reason: 'YEAR_BOUNDARY' | 'MONTH_BOUNDARY';
  boundary: { name: string; korea: string; utc: string };
  candidates: { before: SajuChart; after: SajuChart };
}
export type SajuResult = SajuOk | SajuNeedsTime;

export class SajuInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function findBirthplace(code: string): Birthplace | undefined {
  return BIRTHPLACES.find((b) => b.code === code);
}

function compareDate(a: CivilDate, b: CivilDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function resolveSolarDate(input: BirthInput): { solar: CivilDate; lunar: TimeDetails['lunarDate'] } {
  const { year, month, day } = input;
  if (input.calendar === 'solar') {
    if (input.isLeapMonth) throw new SajuInputError('LEAP_ON_SOLAR', '양력 날짜에는 윤달을 지정할 수 없습니다.');
    if (!isValidCivilDate({ year, month, day })) throw new SajuInputError('INVALID_DATE', '존재하지 않는 날짜입니다.');
    return { solar: { year, month, day }, lunar: null };
  }
  if (input.calendar !== 'lunar') throw new SajuInputError('INVALID_CALENDAR', '양력/음력 구분이 올바르지 않습니다.');
  const cal = new KoreanLunarCalendar();
  const isLeap = input.isLeapMonth === true;
  if (![year, month, day].every(Number.isInteger) || !cal.setLunarDate(year, month, day, isLeap)) {
    throw new SajuInputError(
      isLeap ? 'INVALID_LEAP_MONTH' : 'INVALID_LUNAR_DATE',
      isLeap ? '그해에는 해당 윤달이 없습니다.' : '존재하지 않는 음력 날짜입니다.',
    );
  }
  const s = cal.getSolarCalendar();
  return { solar: { year: s.year, month: s.month, day: s.day }, lunar: { year, month, day, isLeapMonth: isLeap } };
}

/** 연주·월주 (절입 비교는 UTC 순간 기준) */
function yearAndMonth(utcMs: number) {
  const y = yearPillar(sajuYearAt(utcMs));
  const m = monthPillar(y.stem, surroundingJie(utcMs).prev.branch);
  return { year: y, month: m };
}

/** 지방시(ms 표기)로 일주·시주 */
function dayAndHour(localMs: number) {
  const c = civilFromMs(localMs);
  const day = dayPillar(c);
  const branch = hourBranchOf(c.minuteOfDay);
  const lateNightZi = c.hour === 23;
  // 야자시: 일주는 그날, 시주는 다음 날 일간 기준의 子시
  const stemForHour = lateNightZi ? sexagenary(julianDayNumber(c) + 50).stem : day.stem;
  return { day, hour: hourPillar(stemForHour, branch), lateNightZi };
}

export function calculateSaju(input: BirthInput): SajuResult {
  const { solar, lunar } = resolveSolarDate(input);
  if (compareDate(solar, SUPPORTED_RANGE.from) < 0 || compareDate(solar, SUPPORTED_RANGE.to) > 0) {
    throw new SajuInputError('OUT_OF_RANGE', '1920년~2050년(양력) 출생만 지원합니다.');
  }
  const birthplace = findBirthplace(input.birthplaceCode);
  if (!birthplace) throw new SajuInputError('UNKNOWN_BIRTHPLACE', '지원하지 않는 출생지입니다. (국내만 지원)');

  const notices: Notice[] = [];
  const baseTime = { solarDate: formatDate(solar), lunarDate: lunar, birthplace };

  // ── 시간 모름 ──────────────────────────────────────────────
  if (input.time === null) {
    notices.push({ code: 'HOUR_UNKNOWN', message: '태어난 시간을 몰라 시주 없이 6글자로 봅니다.' });
    const time: TimeDetails = {
      ...baseTime, clock: null, utc: null, utcOffsetMinutes: null, dst: null,
      localMeanTime: null, apparentSolarTime: null, equationOfTimeMinutes: null,
    };
    const day = dayPillar(solar);
    const startUtc = koreaCivilToUtc({ ...solar, hour: 0, minute: 0 }).utcMs;
    const endUtc = koreaCivilToUtc({ ...addDays(solar, 1), hour: 0, minute: 0 }).utcMs;
    const atStart = yearAndMonth(startUtc);
    const jie = surroundingJie(startUtc).next;
    if (jie.utcMs < endUtc) {
      const atEnd = yearAndMonth(jie.utcMs);
      return {
        status: 'needs_time',
        engineVersion: ENGINE_VERSION,
        reason: atStart.year.stem !== atEnd.year.stem ? 'YEAR_BOUNDARY' : 'MONTH_BOUNDARY',
        boundary: { name: jie.name, korea: formatKorea(jie.utcMs), utc: new Date(jie.utcMs).toISOString() },
        candidates: {
          before: buildChart({ ...atStart, day, hour: null }),
          after: buildChart({ ...atEnd, day, hour: null }),
        },
        time,
        notices,
      };
    }
    return { status: 'ok', engineVersion: ENGINE_VERSION, chart: buildChart({ ...atStart, day, hour: null }), time, notices };
  }

  // ── 시간 앎 ────────────────────────────────────────────────
  const { hour, minute } = input.time;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new SajuInputError('INVALID_TIME', '시각이 올바르지 않습니다.');
  }
  const clock = { ...solar, hour, minute };
  const conv = koreaCivilToUtc(clock);
  const utcMs = conv.utcMs;
  if (conv.dst) {
    notices.push({ code: 'DST_APPLIED', message: '서머타임 시행 기간이라 1시간을 빼서 계산했습니다.' });
  }
  if (conv.resolution === 'overlap') {
    notices.push({
      code: 'CLOCK_OVERLAP',
      message: '시계를 되돌린 날이라 이 시각이 두 번 있었습니다. 앞선 시각(서머타임 기준)으로 계산했습니다.',
    });
  } else if (conv.resolution === 'gap') {
    notices.push({
      code: 'CLOCK_GAP',
      message: '시계를 앞당긴 날이라 실제로는 없던 시각입니다. 전환 전 시각 기준으로 해석했습니다.',
    });
  }

  const lmtMs = localMeanTimeMs(utcMs, birthplace.longitude);
  const ast = apparentSolarTime(utcMs, birthplace.longitude, birthplace.latitude);
  const ym = yearAndMonth(utcMs);
  const dh = dayAndHour(lmtMs);
  const chart = buildChart({ ...ym, day: dh.day, hour: dh.hour });

  if (dh.lateNightZi) {
    notices.push({
      code: 'LATE_NIGHT_ZI',
      message: '밤 11시~자정 출생은 기준에 따라 해석이 다를 수 있어요. 이 서비스는 일주를 그날로 봅니다.',
    });
  }
  const { prev, next } = surroundingJie(utcMs);
  const nearest = utcMs - prev.utcMs < next.utcMs - utcMs ? prev : next;
  const gapMinutes = Math.abs(utcMs - nearest.utcMs) / 60_000;
  if (gapMinutes <= NEAR_SOLAR_TERM_MINUTES) {
    notices.push({
      code: 'NEAR_SOLAR_TERM',
      message: `${nearest.name} 절입(${formatKorea(nearest.utcMs)})과 ${Math.round(gapMinutes)}분 차이라, 출생 시각이 조금만 달라도 연주·월주가 바뀔 수 있어요.`,
    });
  }
  const astDh = dayAndHour(ast.ms);
  if (astDh.day.stem !== dh.day.stem || astDh.day.branch !== dh.day.branch ||
      astDh.hour.stem !== dh.hour.stem || astDh.hour.branch !== dh.hour.branch) {
    notices.push({
      code: 'APPARENT_SOLAR_TIME_DIFFERS',
      message: '균시차까지 반영하는 기준에서는 일주 또는 시주가 달라질 수 있는 경계 시각이에요.',
    });
  }

  return {
    status: 'ok',
    engineVersion: ENGINE_VERSION,
    chart,
    time: {
      ...baseTime,
      clock: formatDateTime(clock),
      utc: new Date(utcMs).toISOString(),
      utcOffsetMinutes: conv.offsetMinutes,
      dst: conv.dst,
      localMeanTime: formatDateTime(civilFromMs(lmtMs)),
      apparentSolarTime: formatDateTime(civilFromMs(ast.ms)),
      equationOfTimeMinutes: Math.round(ast.equationOfTimeMinutes * 10) / 10,
    },
    notices,
  };
}
