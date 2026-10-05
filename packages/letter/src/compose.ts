// 첫해 첫 장 조립. AI 를 쓰지 않는다 (CLAUDE.md 2, 5-2).
// 본문 120통 중 하나를 고르고, 비유·계절·보조 한 줄과 시점이 들어간 끊기 문장만 끼워 넣는다.
import {
  THEME_AXES, analyzeSeun, dominantSeun, mbtiFeelings, parseMbti, pillarText,
  type Branch, type CivilDate, type Mbti, type SeunAnalysis, type Stem,
} from '@naite/saju';
import { calendarMonthsIn, chooseAnchor, type Anchor } from './anchor.ts';
import {
  BODIES, CUTS, FLAVORS, HOOKS, METAPHOR_FRAMES, METAPHORS, NOW_LINES, SEASON, SEASON_BRIDGES, SUB_SENTENCES, WHEN_IPCHUN, WHEN_NONE,
} from './templates.ts';

export const TEMPLATE_VERSION = '3.1.0';

const AXIS_INDEX = { 'E/I': 0, 'N/S': 1, 'T/F': 2, 'J/P': 3 } as const;

export interface FirstLetterInput {
  dayMaster: Stem;
  /** 일지. 편지가 짚는 시점(일지와 충·합하는 달)을 고르는 데 쓴다 */
  dayBranch: Branch;
  mbti: Mbti | string;
  /** 불리고 싶은 이름. 없으면 "너"로 부른다 */
  name?: string | null;
  /** 편지를 받는 날(오늘) */
  today: CivilDate;
  /** 다음 생일(편지 도착일) */
  nextBirthday: CivilDate;
  /** 조각 선택을 사용자별로 고정하기 위한 키 (출생 정보 등) */
  seedKey: string;
  /** 편지를 여는 순간. 첫마디가 이 날짜·요일·시간대를 짚는다 (없으면 지금) */
  readAt?: Date;
}

/** 편지가 짚은 시점. 봉투(두 번째 장 목차)와 4단계 AI 프롬프트가 같은 값을 쓴다 */
export interface LetterMoment {
  anchor: Anchor;
  /** 편지 안의 부사구. 예: "유난히 조용했던 12월에" */
  when: string;
  /** 봉투 목차용 명사구. 예: "유난히 조용했던 12월" */
  label: string;
}

export interface FirstLetter {
  greeting: string;
  /** 본문 문단. 마지막 문단은 끊기 조각으로 끝난다 */
  paragraphs: string[];
  /** 끊긴 문장 (마지막 문단) */
  cut: string;
  moment: LetterMoment;
  meta: {
    templateVersion: string;
    seunYear: number;
    seunPillar: string;
    seun: SeunAnalysis;
    combination: string;
    bodyKey: string;
    variant: number;
    seasonMonth: number | null;
    period: { from: CivilDate; to: CivilDate };
  };
}

/** FNV-1a 32bit — 같은 입력이면 항상 같은 조각을 고르기 위한 해시 (보안 용도 아님) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function pickIndex(length: number, seedKey: string, slot: string): number {
  return hash(`${seedKey}#${slot}`) % length;
}
function pick<T>(list: readonly T[], seedKey: string, slot: string): T {
  return list[pickIndex(list.length, seedKey, slot)]!;
}

/** 한글 이름 뒤 호격 조사: 받침 있으면 "아", 없으면 "야". 한글로 끝나지 않으면 그대로 */
export function vocative(name: string): string {
  const last = name.charCodeAt(name.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return name;
  return name + ((last - 0xac00) % 28 === 0 ? '야' : '아');
}

export function normalizeName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().replace(/\s+/g, ' ');
  return n.length === 0 ? null : n;
}

function momentOf(anchor: Anchor, seed: string): LetterMoment {
  if (anchor.kind === 'clash' || anchor.kind === 'combine') {
    const flavor = pick(FLAVORS[anchor.kind], seed, 'flavor');
    return { anchor, when: `${flavor} ${anchor.month}월에`, label: `${flavor} ${anchor.month}월` };
  }
  if (anchor.kind === 'ipchun') {
    return { anchor, when: pick(WHEN_IPCHUN, seed, 'when'), label: '입춘 무렵' };
  }
  return { anchor, when: pick(WHEN_NONE, seed, 'when'), label: '1년 중 어느 날' };
}

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const NATIVE_MONTHS: Record<number, string> = { 2: '두 달', 3: '석 달', 4: '넉 달', 5: '다섯 달', 6: '여섯 달', 7: '일곱 달', 8: '여덟 달', 9: '아홉 달' };

function timeOfDay(hour: number): string {
  if (hour < 5) return '새벽';
  if (hour < 11) return '아침';
  if (hour < 17) return '오후';
  if (hour < 21) return '저녁';
  return '밤';
}

/** 받침이 있으면 with, 없으면 without */
function josa(word: string, withBatchim: string, without: string): string {
  const code = word.charCodeAt(word.length - 1);
  const has = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return word + (has ? withBatchim : without);
}

/** 지금부터 다음 생일까지의 길이. 열 달 이상이면 "1년", 아니면 "넉 달"처럼 */
export function spanWord(from: CivilDate, to: CivilDate): string {
  const days = (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000;
  const months = Math.max(2, Math.round(days / 30.44));
  return months >= 10 ? '1년' : NATIVE_MONTHS[months]!;
}

/** 빈 칸을 지운 뒤 생기는 이중 공백·문단 앞뒤 공백 정리 */
function tidy(text: string): string[] {
  return text
    .split('\n\n')
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

export function composeFirstLetter(input: FirstLetterInput): FirstLetter {
  const mbti = parseMbti(input.mbti);
  const name = normalizeName(input.name);
  const seed = input.seedKey;

  const { sajuYear, pillar } = dominantSeun(input.today, input.nextBirthday);
  const seun = analyzeSeun(input.dayMaster, pillar);
  const { combination } = mbtiFeelings(seun.theme, mbti);

  // 1. 인사
  const greeting = name ? `${vocative(name)}, 생일 축하해. 다음 생일의 나야.` : '생일 축하해. 다음 생일의 나야.';

  // 1-1. 첫마디: 편지를 여는 지금(날짜·요일·시간대·계절)과 다음 생일까지의 길이
  const readAt = input.readAt ?? new Date();
  const kst = new Date(readAt.getTime() + 9 * 3600_000);
  const readMonth = kst.getUTCMonth() + 1;
  const span = spanWord(input.today, input.nextBirthday);
  const time = timeOfDay(kst.getUTCHours());
  const hook = pick(HOOKS, seed, 'hook')
    .replace('{date}', `${readMonth}월 ${kst.getUTCDate()}일`)
    .replace('{weekday}', WEEKDAYS[kst.getUTCDay()]!)
    .replace('{time이지}', josa(time, '이지', '지'))
    .replace('{time}', time)
    .replace('{now}', pick(NOW_LINES[readMonth]!, seed, 'now'))
    .replace('{span이나}', josa(span, '이나', '나'))
    .replace('{span이}', josa(span, '이', '가'))
    .replace('{span}', span);

  // 2. 시점: 일지와 충·합하는 월운의 달 (없으면 입춘 무렵, 그것도 없으면 시점 없이). 사람마다 다르다.
  const anchor = chooseAnchor(input.dayBranch, input.today, input.nextBirthday);
  const moment = momentOf(anchor, seed);

  // 3. 본문: 세운 천간 십신 × 주 테마 두 축의 글자 조합 × 버전 3 중 하나
  const bodyKey = THEME_AXES[seun.theme].map((r) => mbti[AXIS_INDEX[r.axis]]).join('');
  const variants = BODIES[seun.stemTenGod][bodyKey]!;
  const variant = pickIndex(variants.length, seed, 'body');

  const anchorMonth = anchor.kind === 'none' ? null : anchor.month;
  // 계절 디테일: 기간 안의 달 중 시점·지금 달과 다른 달
  const months = calendarMonthsIn(input.today, input.nextBirthday).filter((m) => m !== anchorMonth && m !== readMonth);
  const seasonMonth = months.length > 0 ? pick(months, seed, 'season-month') : null;
  const season = seasonMonth === null ? '' : pick(SEASON[seasonMonth]!, seed, 'season');
  // 감정부터 시작하는 버전은 계절 디테일이 본문 중간에 혼자 떠 있지 않도록 딴소리를 꺼내는 말로 잇는다
  const seasonLine = season && variant === 1 ? pick(SEASON_BRIDGES, seed, 'bridge') + season : season;

  const body = variants[variant]!
    .replace('{m}', pick(METAPHOR_FRAMES, seed, 'frame').replace('{m}', METAPHORS[input.dayMaster][seun.theme]))
    .replace('{season}', seasonLine)
    .replace('{sub}', seun.needsSubSentence ? pick(SUB_SENTENCES[seun.branchGroup], seed, 'sub') : '')
    // 본문은 "1년"으로 써 두고, 실제 기간이 짧으면 "넉 달"처럼 바꾼다 (년·달 모두 받침이 있어 조사가 같다)
    .replaceAll('1년', span);

  // 4. 끊기: 1년 중 가장 고마운 일 직전, 그 시점을 짚으며 멈춘다
  const cut = pick(CUTS, seed, 'cut').replace('{when}', moment.when).replaceAll('1년', span);

  return {
    greeting,
    paragraphs: [hook, ...tidy(body), cut],
    cut,
    moment,
    meta: {
      templateVersion: TEMPLATE_VERSION,
      seunYear: sajuYear,
      seunPillar: pillarText(pillar),
      seun,
      combination,
      bodyKey,
      variant,
      seasonMonth,
      period: { from: input.today, to: input.nextBirthday },
    },
  };
}
