// "지금의 나" 체크인과 편지 유형 판정 (CLAUDE.md 2, 5-2 "편지 유형 4가지").
import type { Combination } from '@naite/saju';

export const CHECKIN_FOCUS = ['사람 관계', '해야 할 일', '나 자신', '앞으로의 방향'] as const;
export const CHECKIN_MOOD = ['지쳐 있음', '무난함', '들떠 있음', '복잡함'] as const;
export const CHECKIN_WISH = ['쉬고 싶음', '뭔가 해내고 싶음', '사람과 가까워지고 싶음', '정리하고 싶음'] as const;

export interface Checkin {
  /** 요즘 가장 마음 쓰이는 것 */
  focus: (typeof CHECKIN_FOCUS)[number];
  /** 요즘 마음 상태 */
  mood: (typeof CHECKIN_MOOD)[number];
  /** 다음 생일까지 바라는 것 */
  wish: (typeof CHECKIN_WISH)[number];
}

export function parseCheckin(raw: unknown): Checkin | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ok = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && list.includes(v);
  if (!ok(CHECKIN_FOCUS, r.focus) || !ok(CHECKIN_MOOD, r.mood) || !ok(CHECKIN_WISH, r.wish)) return null;
  return { focus: r.focus, mood: r.mood, wish: r.wish };
}

export type LetterType = '미리 알려 줄게' | '이것만은 지켜' | '이번엔 잡아' | '방향을 고를 때';

/**
 * 편지 유형. 위에서부터 먼저 맞는 것.
 * ③ 이번엔 잡아      : 주 테마 두 축이 둘 다 편함
 * ④ 방향을 고를 때   : 하나 버거움 + (마음 쓰이는 것 = 앞으로의 방향 또는 바라는 것 = 정리하고 싶음)
 * ② 이것만은 지켜    : 버거움 1~2 + 마음 상태 = 지쳐 있음/복잡함
 * ① 미리 알려 줄게   : 그 밖 (버거움 1~2 + 무난함/들떠 있음)
 */
export function letterType(combination: Combination, checkin: Checkin): LetterType {
  if (combination === '둘 다 편함') return '이번엔 잡아';
  if (combination === '하나 버거움 + 하나 편함' && (checkin.focus === '앞으로의 방향' || checkin.wish === '정리하고 싶음')) {
    return '방향을 고를 때';
  }
  if (checkin.mood === '지쳐 있음' || checkin.mood === '복잡함') return '이것만은 지켜';
  return '미리 알려 줄게';
}

/** 유형별 편지의 중심 (AI 지시용) */
export const LETTER_TYPE_GUIDE: Readonly<Record<LetterType, string>> = {
  '미리 알려 줄게': '다가올 고비를 미리 알려 주고 피하는 법을 준다. 따끔한 말이 가장 세다.',
  '이것만은 지켜': '이미 지쳐 있거나 복잡한 사람이다. 경고는 딱 하나만, 대신 버티는 법을 준다. 겁주지 않는다.',
  '이번엔 잡아': '잘 맞는 시기다. 놓치면 아까운 것을 알려 주고, 방심하기 쉬운 순간 하나를 짚는다.',
  '방향을 고를 때': '방향을 고민하는 사람이다. 서두르지 말 것, 우선순위와 내려놓을 것을 알려 준다.',
};
