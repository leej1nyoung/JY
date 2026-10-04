// CLAUDE.md 3. 주기 규칙: 다음 생일(편지 도착일) 계산과 만 나이.
import KoreanLunarCalendar from 'korean-lunar-calendar';
import type { CivilDate } from '@naite/saju';

export type BirthdayBasis = 'solar' | 'lunar';

/** 생일이 될 수 있는 기준 정보 */
export interface BirthdayKey {
  basis: BirthdayBasis;
  /** basis 가 solar 면 양력 월일, lunar 면 음력 월일 (윤달 여부는 생일 계산에 쓰지 않는다) */
  month: number;
  day: number;
}

const cmp = (a: CivilDate, b: CivilDate) => a.year - b.year || a.month - b.month || a.day - b.day;
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 양력 출생일 → 생일 기준 키. 음력 기준이면 음력 월일로 바꾼다. */
export function birthdayKeyOf(solarBirth: CivilDate, basis: BirthdayBasis): BirthdayKey {
  if (basis === 'solar') return { basis, month: solarBirth.month, day: solarBirth.day };
  const cal = new KoreanLunarCalendar();
  if (!cal.setSolarDate(solarBirth.year, solarBirth.month, solarBirth.day)) throw new RangeError('음력 변환 범위 밖입니다.');
  const l = cal.getLunarCalendar();
  return { basis, month: l.month, day: l.day };
}

/**
 * 그해(양력 연도가 아니라 해당 기준의 연도)의 생일 → 양력 날짜.
 * - 양력 2월 29일생: 평년에는 2월 28일 (CLAUDE.md 3)
 * - 음력: 윤달생도 평달 같은 날로 챙긴다. 그달이 29일까지뿐이면 30일생은 29일(그믐)로 챙긴다.
 *   (국내에서 일반적인 관행. docs/letter-engine.md 참고)
 */
export function birthdayInYear(key: BirthdayKey, year: number): CivilDate | null {
  if (key.basis === 'solar') {
    if (key.month === 2 && key.day === 29 && !isLeapYear(year)) return { year, month: 2, day: 28 };
    return { year, month: key.month, day: key.day };
  }
  const cal = new KoreanLunarCalendar();
  for (const d of key.day === 30 ? [30, 29] : [key.day]) {
    if (cal.setLunarDate(year, key.month, d, false)) {
      const s = cal.getSolarCalendar();
      return { year: s.year, month: s.month, day: s.day };
    }
  }
  return null; // 음력 데이터 범위(2050) 밖
}

/** 날짜 + n개월. 말일을 넘으면 그달 말일로 맞춘다 (11-30 + 3개월 = 2-28/29) */
export function addMonths(c: CivilDate, n: number): CivilDate {
  const total = c.year * 12 + (c.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(c.day, daysInMonth(year, month)) };
}

/**
 * 편지가 도착할 다음 생일.
 * 오늘보다 뒤인 첫 생일이 3개월 미만으로 남았으면 그다음 생일로 넘긴다. 생일 당일 방문도 다음 해 생일.
 */
export function nextLetterBirthday(key: BirthdayKey, today: CivilDate): CivilDate {
  const minDate = addMonths(today, 3);
  for (let y = today.year - 1; y <= today.year + 2; y++) {
    const b = birthdayInYear(key, y);
    if (b && cmp(b, today) > 0 && cmp(b, minDate) >= 0) return b;
  }
  throw new RangeError('다음 생일을 계산할 수 없습니다.');
}

/** 만 나이. 2월 29일생은 평년에 3월 1일에 나이가 든다. */
export function koreanInternationalAge(birth: CivilDate, today: CivilDate): number {
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age;
}

/** 서버 기준 한국 오늘 날짜 */
export function todayInKorea(now: Date = new Date()): CivilDate {
  const d = new Date(now.getTime() + 9 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
