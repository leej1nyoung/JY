// 첫해 첫 장 조립. AI 를 쓰지 않는다 (CLAUDE.md 2, 5-2).
import {
  THEME_AXES, analyzeSeun, dominantSeun, mbtiFeelings, parseMbti, pillarText,
  type CivilDate, type Mbti, type SeunAnalysis, type Stem,
} from '@naite/saju';
import { FIRST_YEAR_CUT, LEADS, MBTI_PARAGRAPHS, METAPHOR_FRAMES, METAPHORS, SITUATIONS, SUB_SENTENCES } from './templates.ts';

export const TEMPLATE_VERSION = '2.1.0';

const AXIS_INDEX = { 'E/I': 0, 'N/S': 1, 'T/F': 2, 'J/P': 3 } as const;

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

  // 2. 세운 조각 (상황): 담백한 첫마디 + 정·편 톤 상황 + (지지 그룹이 다르면) 보조 한 줄
  //    → 비유는 있었던 일을 말한 뒤에 지나가듯 한 번 + 풀이 한 문장
  const situationParagraph = [
    pick(LEADS, seed, 'lead'),
    pick(SITUATIONS[seun.stemTenGod], seed, 'situation'),
    ...(seun.needsSubSentence ? [pick(SUB_SENTENCES[seun.branchGroup], seed, 'sub')] : []),
  ].join(' ');
  const metaphor = METAPHORS[input.dayMaster][seun.theme];
  const metaphorParagraph = [pick(METAPHOR_FRAMES, seed, 'frame').replace('{m}', metaphor.m), metaphor.unpack].join(' ');

  // 3. MBTI 조각 (마음): 주 테마의 두 축 글자 조합별 문단 (조합 규칙은 문단 안에 들어 있다)
  const key = THEME_AXES[seun.theme].map((r) => mbti[AXIS_INDEX[r.axis]]).join('');
  const mbtiParagraph = pick(MBTI_PARAGRAPHS[seun.theme][key]!, seed, 'mbti');
  const { combination } = mbtiFeelings(seun.theme, mbti);

  // 4. 끊기 조각
  return {
    greeting,
    paragraphs: [situationParagraph, metaphorParagraph, mbtiParagraph, FIRST_YEAR_CUT],
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
