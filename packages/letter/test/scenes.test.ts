import { describe, expect, it } from 'vitest';
import { monthNote, pickBySeed, THEME_ACTIONS } from '../src/scenes.ts';

describe('행동·달의 계절감', () => {
  it('같은 seed 면 같은 것, 겹치지 않게 n개', () => {
    const list = Object.values(THEME_ACTIONS).flat();
    const a = pickBySeed(list, 'x', 4);
    expect(pickBySeed(list, 'x', 4)).toEqual(a);
    expect(new Set(a).size).toBe(4);
    expect(pickBySeed(list, 'y', 4)).not.toEqual(a);
  });
  it('행동에 흔한 소품이나 직업·가족 말이 없다', () => {
    const all = Object.values(THEME_ACTIONS).flat().join(' ');
    expect(all).not.toMatch(/휴대폰|단톡방|달력|이불|메모장|회사|학교|엄마|애인/);
  });
  it('설·추석은 음력을 양력으로 바꿔 그 해의 달에 붙인다', () => {
    const from = { year: 2026, month: 10, day: 11 };
    const to = { year: 2027, month: 6, day: 19 };
    expect(monthNote(2, from, to)).toBe('아직 추운 늦겨울, 설 연휴가 있는 달'); // 2027 설: 2월
    expect(monthNote(5, from, to)).toBe('공휴일이 끼어 있는 늦봄');
    expect(monthNote(10, { year: 2025, month: 9, day: 1 }, { year: 2026, month: 3, day: 1 })).toContain('추석'); // 2025 추석: 10월 6일
    expect(monthNote(9, { year: 2026, month: 3, day: 1 }, { year: 2027, month: 3, day: 1 })).toContain('추석'); // 2026 추석: 9월 25일
  });
});

import { jargonHits } from '../src/rules.ts';
describe('명리 용어 검사: 일상어는 빼고', () => {
  it('일상어 속 글자는 잡지 않는다', () => {
    for (const t of ['혼자 충전되는 편인데', '그건 상관없어', '좀 식상해', '계획을 세운 날', '습관성으로', '3일간 쉬었어', '확정인데', '어떤 편인지']) expect(jargonHits(t)).toEqual([]);
  });
  it('명리 용어는 잡는다', () => {
    expect(jargonHits('올해는 편인이 들어와')).toEqual(['편인']);
    expect(jargonHits('상관 기운이 세')).toEqual(['상관']);
    expect(jargonHits('세운의 흐름')).toEqual(['세운']);
    expect(jargonHits('일간이 庚')).toEqual(['일간']);
  });
});
