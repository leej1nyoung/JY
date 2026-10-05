// 입력 폼 → 첫해 첫 장. 웹(서버)에서 이 함수 하나만 부른다. 아무것도 저장하지 않는다.
import { calculateSaju, pillarKorean, pillarText, SajuInputError, type CivilDate } from '@naite/saju';
import { composeFirstLetter, normalizeName, type FirstLetter } from './compose.ts';
import { birthdayKeyOf, koreanInternationalAge, nextLetterBirthday, todayInKorea, type BirthdayBasis } from './cycle.ts';

export const NAME_MAX_LENGTH = 10;
export const MIN_AGE = 14;

export interface FirstLetterRequest {
  calendar: 'solar' | 'lunar';
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
  /** 모르면 null */
  time: { hour: number; minute: number } | null;
  birthplaceCode: string;
  mbti: string;
  name: string | null;
  birthdayBasis: BirthdayBasis;
  confirmSelf: boolean;
  confirmAge: boolean;
}

/** 편지에 찍는 소인: 일주와 출생일 ("이 사람에게 맞춰 썼다"는 표시) */
export interface LetterStamp {
  dayPillar: string;
  dayPillarKo: string;
  birthDate: string;
}

export type FirstLetterField = 'birth' | 'time' | 'birthplace' | 'mbti' | 'name' | 'birthdayBasis' | 'confirm';

export type FirstLetterResponse =
  | { ok: true; letter: FirstLetter; nextBirthday: CivilDate; notes: string[]; stamp: LetterStamp }
  | { ok: false; field: FirstLetterField; message: string };

const fail = (field: FirstLetterField, message: string): FirstLetterResponse => ({ ok: false, field, message });
const cmp = (a: CivilDate, b: CivilDate) => a.year - b.year || a.month - b.month || a.day - b.day;

const FIELD_OF_SAJU_ERROR: Record<string, FirstLetterField> = {
  INVALID_TIME: 'time',
  UNKNOWN_BIRTHPLACE: 'birthplace',
};

export function createFirstLetter(req: FirstLetterRequest, now: Date = new Date()): FirstLetterResponse {
  if (!req.confirmSelf || !req.confirmAge) return fail('confirm', '확인 항목에 모두 체크해 주세요.');
  if (!/^[EI][NS][TF][JP]$/.test(req.mbti)) return fail('mbti', 'MBTI 네 글자를 모두 골라 주세요.');
  if (req.birthdayBasis !== 'solar' && req.birthdayBasis !== 'lunar') return fail('birthdayBasis', '생일을 언제 챙기는지 골라 주세요.');
  const name = normalizeName(req.name);
  if (name && [...name].length > NAME_MAX_LENGTH) return fail('name', `이름은 ${NAME_MAX_LENGTH}자까지 쓸 수 있어요.`);

  let saju;
  try {
    saju = calculateSaju({
      calendar: req.calendar,
      year: req.year,
      month: req.month,
      day: req.day,
      isLeapMonth: req.calendar === 'lunar' ? req.isLeapMonth : false,
      time: req.time,
      birthplaceCode: req.birthplaceCode,
    });
  } catch (e) {
    if (e instanceof SajuInputError) return fail(FIELD_OF_SAJU_ERROR[e.code] ?? 'birth', e.message);
    throw e;
  }

  const today = todayInKorea(now);
  const [y, m, d] = saju.time.solarDate.split('-').map(Number) as [number, number, number];
  const solarBirth: CivilDate = { year: y, month: m, day: d };
  if (cmp(solarBirth, today) > 0) return fail('birth', '아직 오지 않은 날짜예요.');
  if (koreanInternationalAge(solarBirth, today) < MIN_AGE) return fail('confirm', `만 ${MIN_AGE}세 이상만 이용할 수 있어요.`);

  const nextBirthday = nextLetterBirthday(birthdayKeyOf(solarBirth, req.birthdayBasis), today);
  // 시간을 모르고 절입일이라 연·월주가 미정이어도 일간은 같다. 첫 장은 일간과 세운만 쓴다.
  const chart = saju.status === 'ok' ? saju.chart : saju.candidates.before;
  const dayMaster = chart.dayMaster;

  const letter = composeFirstLetter({
    dayMaster,
    dayBranch: chart.pillars.day.branch,
    mbti: req.mbti,
    name,
    today,
    nextBirthday,
    seedKey: [saju.time.solarDate, saju.time.clock ?? 'unknown', req.birthplaceCode, req.mbti].join('|'),
  });

  const notes = saju.notices.filter((n) => n.code === 'LATE_NIGHT_ZI').map(() => '밤 11시~자정에 태어난 경우, 기준에 따라 해석이 다를 수 있어요.');
  const stamp: LetterStamp = {
    dayPillar: pillarText(chart.pillars.day),
    dayPillarKo: pillarKorean(chart.pillars.day),
    birthDate: saju.time.solarDate,
  };
  return { ok: true, letter, nextBirthday, notes, stamp };
}
