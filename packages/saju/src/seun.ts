// 세운(歲運) 판정과 CLAUDE.md 5-2 "세운 기운별 테마와 MBTI 축" 매핑.
import { BRANCH_MAIN_QI, TEN_GOD_GROUP, tenGodOf, type Stem, type TenGod, type TenGodGroup } from './constants.ts';
import { yearPillar, type Pillar } from './pillars.ts';
import { ipchunUtc, sajuYearAt } from './solar-terms.ts';
import { koreaCivilToUtc, isValidCivilDate, type CivilDate } from './time.ts';
import { parseMbti, type Mbti } from './mbti.ts';

const DAY = 86_400_000;

export interface SeunShare {
  sajuYear: number;
  pillar: Pillar;
  /** 기간 중 이 해가 차지하는 일수(소수 포함, 입춘 시각까지 정밀 계산) */
  days: number;
}

/**
 * "지금부터 다음 생일까지" 기간을 입춘으로 나눴을 때 더 많은 날을 차지하는 해의 세운.
 * 기간 = [from 00:00, to 00:00) 한국 시각. 즉 기준일은 포함하고 생일 당일은 제외한다
 * (생일은 편지가 도착하는 날이고, 편지는 그 전날까지의 1년을 돌아본다).
 * 차지하는 시간이 정확히 같으면 뒤의 해(편지를 쓰는 '미래의 나'가 서 있는 해)를 쓴다.
 */
export function dominantSeun(from: CivilDate, to: CivilDate): { sajuYear: number; pillar: Pillar; shares: SeunShare[] } {
  if (!isValidCivilDate(from) || !isValidCivilDate(to)) throw new RangeError('존재하지 않는 날짜입니다.');
  const start = koreaCivilToUtc({ ...from, hour: 0, minute: 0 }).utcMs;
  const end = koreaCivilToUtc({ ...to, hour: 0, minute: 0 }).utcMs;
  if (end <= start) throw new RangeError('기간의 끝이 시작보다 뒤여야 합니다.');

  const shares: SeunShare[] = [];
  let cursor = start;
  while (cursor < end) {
    const y = sajuYearAt(cursor);
    const segEnd = Math.min(ipchunUtc(y + 1), end);
    shares.push({ sajuYear: y, pillar: yearPillar(y), days: (segEnd - cursor) / DAY });
    cursor = segEnd;
  }
  let best = shares[0]!;
  for (const s of shares) if (s.days >= best.days) best = s;
  return { sajuYear: best.sajuYear, pillar: best.pillar, shares };
}

/** 정/편 톤 (CLAUDE.md 5-2) */
export const TEN_GOD_TONE: Readonly<Record<TenGod, string>> = {
  비견: '나란히 걷는 동료',
  겁재: '내 것을 다투는 경쟁',
  식신: '여유 있게 꾸준히 만들어냄',
  상관: '날카롭게 터져 나오는 표현, 틀에 대한 반발',
  정재: '꼼꼼하게 쌓는 현실',
  편재: '크게 움직이고 흩어지는 현실',
  정관: '질서 있는 책임',
  편관: '갑작스럽고 강한 압박',
  정인: '따뜻한 배움과 보호',
  편인: '혼자 파고드는 생각, 약간의 고독',
};

export interface SeunAnalysis {
  pillar: Pillar;
  /** 세운 천간의 십신 → 주 테마 */
  stemTenGod: TenGod;
  theme: TenGodGroup;
  tone: string;
  /** 세운 지지 본기 */
  branchMainQi: Stem;
  branchTenGod: TenGod;
  branchGroup: TenGodGroup;
  /** 지지 그룹이 주 테마와 다르면 보조 문장 한 줄 */
  needsSubSentence: boolean;
}

export function analyzeSeun(dayMaster: Stem, pillar: Pillar): SeunAnalysis {
  const stemTenGod = tenGodOf(dayMaster, pillar.stem);
  const branchMainQi = BRANCH_MAIN_QI[pillar.branch];
  const branchTenGod = tenGodOf(dayMaster, branchMainQi);
  const theme = TEN_GOD_GROUP[stemTenGod];
  const branchGroup = TEN_GOD_GROUP[branchTenGod];
  return {
    pillar, stemTenGod, theme, tone: TEN_GOD_TONE[stemTenGod],
    branchMainQi, branchTenGod, branchGroup, needsSubSentence: branchGroup !== theme,
  };
}

export type Axis = 'E/I' | 'N/S' | 'T/F' | 'J/P';
type Letter = 'E' | 'I' | 'N' | 'S' | 'T' | 'F' | 'J' | 'P';

interface AxisRule {
  axis: Axis;
  easy: Letter;
  hard: Letter;
}

/** 세운 기운별 핵심 축 2개와 편했을/버거웠을 쪽 (CLAUDE.md 5-2 표 그대로, 표의 순서 유지) */
export const THEME_AXES: Readonly<Record<TenGodGroup, readonly [AxisRule, AxisRule]>> = {
  비겁: [{ axis: 'E/I', easy: 'E', hard: 'I' }, { axis: 'T/F', easy: 'T', hard: 'F' }],
  식상: [{ axis: 'E/I', easy: 'E', hard: 'I' }, { axis: 'J/P', easy: 'P', hard: 'J' }],
  재성: [{ axis: 'N/S', easy: 'S', hard: 'N' }, { axis: 'J/P', easy: 'J', hard: 'P' }],
  관성: [{ axis: 'J/P', easy: 'J', hard: 'P' }, { axis: 'T/F', easy: 'T', hard: 'F' }],
  인성: [{ axis: 'N/S', easy: 'N', hard: 'S' }, { axis: 'E/I', easy: 'I', hard: 'E' }],
};

export interface AxisFeeling {
  axis: Axis;
  /** 사용자의 그 축 글자 */
  side: Letter;
  feeling: '편함' | '버거움';
}
export type Combination = '둘 다 버거움' | '하나 버거움 + 하나 편함' | '둘 다 편함';

const AXIS_INDEX: Readonly<Record<Axis, number>> = { 'E/I': 0, 'N/S': 1, 'T/F': 2, 'J/P': 3 };

export function mbtiFeelings(theme: TenGodGroup, mbti: Mbti | string): {
  axes: [AxisFeeling, AxisFeeling];
  combination: Combination;
} {
  const m = parseMbti(mbti);
  const axes = THEME_AXES[theme].map((r): AxisFeeling => {
    const side = m[AXIS_INDEX[r.axis]] as Letter;
    return { axis: r.axis, side, feeling: side === r.easy ? '편함' : '버거움' };
  }) as [AxisFeeling, AxisFeeling];
  const hard = axes.filter((a) => a.feeling === '버거움').length;
  const combination: Combination = hard === 2 ? '둘 다 버거움' : hard === 1 ? '하나 버거움 + 하나 편함' : '둘 다 편함';
  // 조합 규칙: 하나 버거움 + 하나 편함이면 버거운 쪽을 먼저 말한다.
  if (hard === 1 && axes[0].feeling === '편함') axes.reverse();
  return { axes, combination };
}
