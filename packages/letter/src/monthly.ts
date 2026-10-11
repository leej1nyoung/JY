// 월별 공략 달력 (두 번째 장의 중심). 다음 생일까지의 기간을 월운(절입 기준 달)으로 나누고, 달마다 계산한다.
//
// 쓰는 근거 (여러 출처에서 일치한 것만. 조사: 2026-10, docs/letter-engine.md "월별 공략")
// - 월운 천간의 십신 → 그 달에 늘어나는 일의 종류 (세운과 같은 테마 표). 용신을 계산하지 않으므로 길흉으로 판정하지 않는다.
// - 월지와 일지(日支)의 관계: 충 > 합 > 형 > 원진 순으로 하나만 본다. 파·해는 쓰지 않는다.
// - 천을귀인(일간 기준): 그 달 월지가 귀인 자리면 "도와줄 사람이 나타나기 쉬운 달".
// - 십이운성·도화·역마는 쓰지 않는다 (해석이 갈리거나, 건강·연애·이사를 짐작하게 됨).
// 달마다의 판정(잘 풀리는 달 ~ 흔들리기 쉬운 달)은 위 근거를 점수로 묶은 이 서비스의 해석이다.
import {
  analyzeSeun, jieOfYear, koreaCivilToUtc, mbtiFeelings, monthPillar, sajuYearAt, yearPillar,
  type Branch, type CivilDate, type Pillar, type Stem, type TenGod, type TenGodGroup,
} from '@naite/saju';
import { isClash, isCombine } from './anchor.ts';
import { SIDE_FEELING, THEME_SITUATION } from './second-page.ts';

const DAY = 86_400_000;
/** 기간과 이보다 적게 겹치는 달 조각은 달력에 넣지 않는다 */
const MIN_DAYS = 10;

/** 원진: 子未 丑午 寅酉 卯申 辰亥 巳戌 */
const WONJIN: readonly string[] = ['子未', '丑午', '寅酉', '卯申', '辰亥', '巳戌'];
/** 형: 삼형 寅巳申·丑戌未(둘씩), 상형 子卯, 자형 辰辰 午午 酉酉 亥亥 */
const HYEONG: readonly string[] = ['寅巳', '巳申', '申寅', '丑戌', '戌未', '未丑', '子卯', '辰辰', '午午', '酉酉', '亥亥'];
const pairIn = (list: readonly string[], a: Branch, b: Branch) => list.includes(a + b) || list.includes(b + a);

export type BranchRelation = '충' | '합' | '형' | '원진';

/** 월지와 일지의 관계 하나 (충 > 합 > 형 > 원진) */
export function branchRelation(month: Branch, day: Branch): BranchRelation | null {
  if (isClash(month, day)) return '충';
  if (isCombine(month, day)) return '합';
  if (pairIn(HYEONG, month, day)) return '형';
  if (pairIn(WONJIN, month, day)) return '원진';
  return null;
}

/** 천을귀인 (일간 기준): 甲戊庚 丑未 / 乙己 子申 / 丙丁 亥酉 / 辛 寅午 / 壬癸 巳卯 */
const NOBLE: Readonly<Record<Stem, readonly Branch[]>> = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  辛: ['寅', '午'],
  壬: ['巳', '卯'], 癸: ['巳', '卯'],
};
export function isNobleHelper(dayMaster: Stem, branch: Branch): boolean {
  return NOBLE[dayMaster].includes(branch);
}

const RELATION_MEANING: Readonly<Record<BranchRelation, string>> = {
  충: '나와 부딪히는 기운. 마음과 계획이 흔들리기 쉬움',
  합: '나와 잘 맞물리는 기운. 일과 사람이 잘 맞춰짐',
  형: '스스로 만든 압박이나 마찰이 생기기 쉬움',
  원진: '말하지 않은 서운함이 쌓이기 쉬움',
};

/** 같은 그룹이라도 편(偏) 쪽은 결이 세다 (CLAUDE.md 정/편 톤) */
const STRONG: readonly TenGod[] = ['겁재', '상관', '편재', '편관', '편인'];

export type MonthVerdict = '잘 풀리는 달' | '괜찮은 달' | '무난한 달' | '버거운 달' | '흔들리기 쉬운 달';

export interface MonthGuide {
  /** 절입일의 양력 달 (이 달력에서 부르는 이름) */
  month: number;
  /** 기간 안에서 이 달이 시작·끝나는 날 (한국 날짜, 끝 포함) */
  start: CivilDate;
  end: CivilDate;
  pillar: Pillar;
  tenGod: TenGod;
  theme: TenGodGroup;
  tone: string;
  situation: string;
  feelings: { axis: string; side: string; feeling: '편함' | '버거움'; mind: string }[];
  combination: string;
  relation: BranchRelation | null;
  relationMeaning: string | null;
  /** 천을귀인 자리 */
  helper: boolean;
  /** 입춘으로 시작하는 달 (사주로 해가 바뀜) */
  newYear: boolean;
  score: number;
  verdict: MonthVerdict;
}

function kstDate(utcMs: number): CivilDate {
  const d = new Date(utcMs + 9 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function verdictOf(score: number): MonthVerdict {
  if (score >= 2) return '잘 풀리는 달';
  if (score === 1) return '괜찮은 달';
  if (score === 0) return '무난한 달';
  if (score === -1) return '버거운 달';
  return '흔들리기 쉬운 달';
}

/**
 * 기간 [from, to) 의 월별 공략 재료. to 는 다음 생일(편지가 도착하는 날)이라 제외한다.
 * 점수: 조합(둘 다 편함 +1 / 반반 0 / 둘 다 버거움 −1, 버거운 달이 편(偏)이면 −1 더) + 관계(합 +2, 충 −2, 형·원진 −1).
 * 천을귀인은 점수에 넣지 않고 따로 표시한다 (버거움을 없애 주지는 않으니까).
 */
export function monthlyGuide(dayMaster: Stem, dayBranch: Branch, mbti: string, from: CivilDate, to: CivilDate): MonthGuide[] {
  const start = koreaCivilToUtc({ ...from, hour: 0, minute: 0 }).utcMs;
  const end = koreaCivilToUtc({ ...to, hour: 0, minute: 0 }).utcMs;
  const jies = [];
  for (let y = from.year - 1; y <= to.year + 1; y++) jies.push(...jieOfYear(y));
  jies.sort((a, b) => a.utcMs - b.utcMs);
  const out: MonthGuide[] = [];
  for (let i = 0; i < jies.length - 1; i++) {
    const s = Math.max(jies[i]!.utcMs, start);
    const e = Math.min(jies[i + 1]!.utcMs, end);
    if ((e - s) / DAY < MIN_DAYS) continue;
    const branch = jies[i]!.branch;
    const yStem = yearPillar(sajuYearAt(jies[i]!.utcMs + DAY)).stem;
    const pillar = monthPillar(yStem, branch);
    const a = analyzeSeun(dayMaster, pillar);
    const { axes, combination } = mbtiFeelings(a.theme, mbti);
    const relation = branchRelation(branch, dayBranch);
    let score = combination === '둘 다 편함' ? 1 : combination === '둘 다 버거움' ? -1 : 0;
    if (combination === '둘 다 버거움' && STRONG.includes(a.stemTenGod)) score -= 1;
    score += relation === '합' ? 2 : relation === '충' ? -2 : relation ? -1 : 0;
    // 기간 시작일이 달 중간이면 그날부터, 끝은 다음 절입 전날 또는 생일 전날
    const startDay = kstDate(s);
    const endDay = kstDate(e === jies[i + 1]!.utcMs ? jies[i + 1]!.utcMs - DAY : e - DAY);
    out.push({
      month: kstDate(jies[i]!.utcMs).month,
      start: startDay,
      end: endDay,
      pillar,
      tenGod: a.stemTenGod,
      theme: a.theme,
      tone: a.tone,
      situation: THEME_SITUATION[a.theme],
      feelings: axes.map((x) => ({ ...x, mind: SIDE_FEELING[a.theme][x.side]! })),
      combination,
      relation,
      relationMeaning: relation ? RELATION_MEANING[relation] : null,
      helper: isNobleHelper(dayMaster, branch),
      newYear: branch === '寅',
      score,
      verdict: verdictOf(score),
    });
  }
  return out;
}

/**
 * 첫 장이 끊기는 달: ③ 이번엔 잡아는 점수가 가장 높은 달, 그 밖은 가장 낮은 달.
 * 점수가 같으면 더 뚜렷한 달 (좋은 쪽은 합 > 귀인, 나쁜 쪽은 충 > 형·원진), 그래도 같으면 앞의 달.
 */
export function keyMonthOf(months: MonthGuide[], best: boolean): MonthGuide | null {
  const mark = (m: MonthGuide) =>
    best ? (m.relation === '합' ? 2 : 0) + (m.helper ? 1 : 0) : m.relation === '충' ? 2 : m.relation === '형' || m.relation === '원진' ? 1 : 0;
  let pick: MonthGuide | null = null;
  for (const m of months) {
    if (!pick) { pick = m; continue; }
    const better = best ? m.score > pick.score : m.score < pick.score;
    if (better || (m.score === pick.score && mark(m) > mark(pick))) pick = m;
  }
  return pick;
}
