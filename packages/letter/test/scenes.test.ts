import { describe, expect, it } from 'vitest';
import { monthNote, pickBySeed, SCENES, THEME_ACTIONS } from '../src/scenes.ts';

describe('생활 장면·행동·달의 계절감', () => {
  it('같은 seed 면 같은 장면, 겹치지 않게 n개', () => {
    const a = pickBySeed(SCENES, 'x', 4);
    expect(pickBySeed(SCENES, 'x', 4)).toEqual(a);
    expect(new Set(a).size).toBe(4);
    expect(pickBySeed(SCENES, 'y', 4)).not.toEqual(a);
  });
  it('장면·행동에 흔한 소품이나 직업·가족 말이 없다', () => {
    const all = [...SCENES, ...Object.values(THEME_ACTIONS).flat()].join(' ');
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
