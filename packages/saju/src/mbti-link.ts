// CLAUDE.md 5-8 사주-MBTI 연결 규칙 (보조). 사주로 MBTI 유형을 맞히지 않고, 축별로 사주가 가리키는 쪽만 점수로 낸다.
// 점수는 0.5 단위가 섞이므로 부동소수 오차 없이 경계(≥0.5, ≥0.2)를 판정하려고 내부적으로 2배한 정수로 계산한다.
import { TEN_GOD_GROUP, type TenGod } from './constants.ts';
import type { SajuChart } from './pillars.ts';
import { parseMbti, type Mbti } from './mbti.ts';
import type { Axis } from './seun.ts';

export type Strength = '뚜렷' | '약간' | '균형';

export interface AxisScore {
  axis: Axis;
  leftLetter: string;
  rightLetter: string;
  left: number;
  right: number;
  /** (왼쪽 − 오른쪽) / (왼쪽 + 오른쪽). 합이 0이면 0 */
  score: number;
  strength: Strength;
  /** 사주가 가리키는 쪽. 균형이면 null */
  direction: string | null;
}

const J_SIDE: readonly TenGod[] = ['정관', '정인', '정재', '식신'];
const P_SIDE: readonly TenGod[] = ['편관', '편인', '편재', '상관'];

/** l2, r2 는 실제 점수의 2배(정수) */
export function judgeAxis(axis: Axis, leftLetter: string, rightLetter: string, l2: number, r2: number): AxisScore {
  const sum = l2 + r2;
  const diff = Math.abs(l2 - r2);
  let strength: Strength;
  if (sum === 0) strength = '균형';
  else if (2 * diff >= sum) strength = '뚜렷'; // |score| ≥ 0.5
  else if (5 * diff >= sum) strength = '약간'; // |score| ≥ 0.2
  else strength = '균형';
  // 왼쪽 + 오른쪽 < 2 → 근거가 적어 최대 '약간'
  if (strength === '뚜렷' && sum < 4) strength = '약간';
  return {
    axis, leftLetter, rightLetter,
    left: l2 / 2, right: r2 / 2,
    score: sum === 0 ? 0 : (l2 - r2) / sum,
    strength,
    direction: strength === '균형' ? null : l2 > r2 ? leftLetter : rightLetter,
  };
}

export function sajuAxisScores(chart: SajuChart): [AxisScore, AxisScore, AxisScore, AxisScore] {
  const g = chart.glyphs;
  const count = (pred: (x: (typeof g)[number]) => boolean) => g.filter(pred).length;
  const groupCount = (group: string) => count((x) => x.tenGod !== null && TEN_GOD_GROUP[x.tenGod] === group);

  // E/I: 양 글자 × 0.5 + 식상 / 음 글자 × 0.5 + 관성 (일간 포함 전 글자의 음양)
  const e2 = count((x) => x.yinYang === '양') + 2 * groupCount('식상');
  const i2 = count((x) => x.yinYang === '음') + 2 * groupCount('관성');
  // N/S: 인성 / 재성
  const n2 = 2 * groupCount('인성');
  const s2 = 2 * groupCount('재성');
  // T/F: 金+水 / 木+火 (일간 포함, 土는 중립)
  const t2 = 2 * count((x) => x.element === '金' || x.element === '水');
  const f2 = 2 * count((x) => x.element === '木' || x.element === '火');
  // J/P: 정관+정인+정재+식신 / 편관+편인+편재+상관
  const j2 = 2 * count((x) => x.tenGod !== null && J_SIDE.includes(x.tenGod));
  const p2 = 2 * count((x) => x.tenGod !== null && P_SIDE.includes(x.tenGod));

  return [
    judgeAxis('E/I', 'E', 'I', e2, i2),
    judgeAxis('N/S', 'N', 'S', n2, s2),
    judgeAxis('T/F', 'T', 'F', t2, f2),
    judgeAxis('J/P', 'J', 'P', j2, p2),
  ];
}

export type AxisMatch = '일치' | '불일치' | null;

/** 실제 MBTI 와 축별 비교. 사주 판정이 균형이면 null */
export function compareWithMbti(scores: readonly AxisScore[], mbti: Mbti | string) {
  const m = parseMbti(mbti);
  return scores.map((s, i) => ({
    ...s,
    actual: m[i]!,
    match: (s.direction === null ? null : s.direction === m[i] ? '일치' : '불일치') as AxisMatch,
  }));
}

export type ChangeKind = '타고난 쪽으로' | '타고난 쪽에서 멀어짐' | '균형 축의 변화';

/** 해마다 MBTI 가 바뀔 때, 바뀐 축별 해석 분류 (CLAUDE.md 5-8) */
export function classifyMbtiChange(scores: readonly AxisScore[], previous: Mbti | string, current: Mbti | string) {
  const a = parseMbti(previous);
  const b = parseMbti(current);
  const changes: { axis: Axis; from: string; to: string; kind: ChangeKind }[] = [];
  scores.forEach((s, i) => {
    if (a[i] === b[i]) return;
    const kind: ChangeKind =
      s.direction === null ? '균형 축의 변화' : b[i] === s.direction ? '타고난 쪽으로' : '타고난 쪽에서 멀어짐';
    changes.push({ axis: s.axis, from: a[i]!, to: b[i]!, kind });
  });
  return changes;
}
