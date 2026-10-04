// 첫해 첫 장 조립. AI 를 쓰지 않는다 (CLAUDE.md 2, 5-2).
import {
  analyzeSeun, dominantSeun, mbtiFeelings, parseMbti, pillarText,
  type CivilDate, type Mbti, type SeunAnalysis, type Stem,
} from '@naite/saju';
import {
  BOTH_EASY_OPENERS, BOTH_HARD_CLOSERS, CARELESS_MOMENTS, FIRST_YEAR_CUT, MBTI_SENTENCES,
  METAPHORS, MIXED_CLOSERS, OPENERS, SITUATIONS, SUB_SENTENCES,
} from './templates.ts';

export const TEMPLATE_VERSION = '1.0.0';

export interface FirstLetterInput {
  dayMaster: Stem;
  mbti: Mbti | string;
  /** 불리고 싶은 이름. 없으면 "너"로 부른다 */
  name?: string | null;
  /** 편지를 받는 날(오늘) */
  today: CivilDate;
  /** 다음 생일(편지 도착일) */
  nextBirthday: CivilDate;
  /** 조각 선택을 사용자별로 고정하기 위한 키 (출생 정보 등) */
  seedKey: string;
}

export interface FirstLetter {
  greeting: string;
  /** 본문 문단. 마지막 문단은 끊기 조각으로 끝난다 */
  paragraphs: string[];
  /** 끊긴 문장 (마지막 문단 끝) */
  cut: string;
  meta: {
    templateVersion: string;
    seunYear: number;
    seunPillar: string;
    seun: SeunAnalysis;
    combination: string;
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
function pick<T>(list: readonly T[], seedKey: string, slot: string): T {
  return list[hash(`${seedKey}#${slot}`) % list.length]!;
}

/** 한글 이름 뒤 호격 조사: 받침 있으면 "아", 없으면 "야". 한글로 끝나지 않으면 쉼표만 */
export function vocative(name: string): string {
  const last = name.charCodeAt(name.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return name;
  return name + ((last - 0xac00) % 28 === 0 ? '야' : '아');
}

export function normalizeName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().replace(/\s+/g, ' ');
  return n.length === 0 ? null : n;
}

export function composeFirstLetter(input: FirstLetterInput): FirstLetter {
  const mbti = parseMbti(input.mbti);
  const name = normalizeName(input.name);
  const seed = input.seedKey;

  const { sajuYear, pillar } = dominantSeun(input.today, input.nextBirthday);
  const seun = analyzeSeun(input.dayMaster, pillar);

  // 1. 인사
  const greeting = name ? `${vocative(name)}, 생일 축하해. 다음 생일의 나야.` : '생일 축하해. 다음 생일의 나야.';

  // 2. 세운 조각 (상황): 비유 + 정/편 톤 상황 문장 + (지지 그룹이 다르면) 보조 문장
  const seunParagraph = [
    pick(OPENERS, seed, 'opener').replace('{m}', METAPHORS[input.dayMaster][seun.theme]),
    pick(SITUATIONS[seun.stemTenGod], seed, 'situation'),
    ...(seun.needsSubSentence ? [pick(SUB_SENTENCES[seun.branchGroup], seed, 'sub')] : []),
  ].join(' ');

  // 3. MBTI 조각 (마음): 주 테마의 두 축, 조합 규칙
  const { axes, combination } = mbtiFeelings(seun.theme, mbti);
  // 축 문장은 버전 0이 "~거야.", 버전 1이 "~지."로 끝난다. 두 문장의 말끝이 겹치지 않도록 서로 다른 버전을 쓴다.
  const firstVersion = hash(`${seed}#mbti`) % 2;
  const sentence = (i: 0 | 1) => MBTI_SENTENCES[seun.theme][axes[i].side]![i === 0 ? firstVersion : 1 - firstVersion]!;
  let mbtiParagraph: string;
  if (combination === '둘 다 버거움') {
    mbtiParagraph = [sentence(0), sentence(1), pick(BOTH_HARD_CLOSERS, seed, 'hard-closer')].join(' ');
  } else if (combination === '하나 버거움 + 하나 편함') {
    // axes 는 버거운 쪽이 먼저 온다
    mbtiParagraph = [sentence(0), `그래도 ${sentence(1)}`, pick(MIXED_CLOSERS, seed, 'mixed-closer')].join(' ');
  } else {
    mbtiParagraph = [
      pick(BOTH_EASY_OPENERS, seed, 'easy-opener'), sentence(0), sentence(1),
      pick(CARELESS_MOMENTS[seun.theme], seed, 'careless'),
    ].join(' ');
  }

  // 4. 끊기 조각
  return {
    greeting,
    paragraphs: [seunParagraph, mbtiParagraph, FIRST_YEAR_CUT],
    cut: FIRST_YEAR_CUT,
    meta: {
      templateVersion: TEMPLATE_VERSION,
      seunYear: sajuYear,
      seunPillar: pillarText(pillar),
      seun,
      combination,
      period: { from: input.today, to: input.nextBirthday },
    },
  };
}
