import { describe, expect, it } from 'vitest';
import {
  THEME_AXES, analyzeSeun, classifyMbtiChange, dominantSeun, judgeAxis, mbtiFeelings, parseMbti, pillarText,
  sajuAxisScores, calculateSaju,
} from '../src/index.ts';

describe('세운 판정', () => {
  it('입춘 이전에 끝나는 기간은 그 해 하나', () => {
    const s = dominantSeun({ year: 2026, month: 3, day: 1 }, { year: 2026, month: 12, day: 1 });
    expect(s.shares.map((x) => pillarText(x.pillar))).toEqual(['丙午']);
  });
  it('입춘 직후가 대부분이면 새 해', () => {
    const s = dominantSeun({ year: 2026, month: 12, day: 1 }, { year: 2027, month: 9, day: 1 });
    expect(pillarText(s.pillar)).toBe('丁未');
  });
  it('15개월 기간이 세 해에 걸쳐도 가장 긴 해를 고른다', () => {
    const s = dominantSeun({ year: 2026, month: 1, day: 1 }, { year: 2027, month: 4, day: 1 });
    expect(s.shares.map((x) => pillarText(x.pillar))).toEqual(['乙巳', '丙午', '丁未']);
    expect(pillarText(s.pillar)).toBe('丙午');
  });
  it('끝이 시작보다 앞서면 오류', () => {
    expect(() => dominantSeun({ year: 2027, month: 1, day: 1 }, { year: 2026, month: 1, day: 1 })).toThrow();
  });
});

describe('세운 기운 → MBTI 축 (CLAUDE.md 5-2 표)', () => {
  it('표 그대로', () => {
    const t = Object.fromEntries(Object.entries(THEME_AXES).map(([k, v]) => [k, v.map((r) => `${r.axis}:${r.easy}편함/${r.hard}버거움`)]));
    expect(t).toEqual({
      비겁: ['E/I:E편함/I버거움', 'T/F:T편함/F버거움'],
      식상: ['E/I:E편함/I버거움', 'J/P:P편함/J버거움'],
      재성: ['N/S:S편함/N버거움', 'J/P:J편함/P버거움'],
      관성: ['J/P:J편함/P버거움', 'T/F:T편함/F버거움'],
      인성: ['N/S:N편함/S버거움', 'E/I:I편함/E버거움'],
    });
  });
  it('각 축이 2~3번씩 쓰인다', () => {
    const counts: Record<string, number> = {};
    for (const rules of Object.values(THEME_AXES)) for (const r of rules) counts[r.axis] = (counts[r.axis] ?? 0) + 1;
    for (const n of Object.values(counts)) expect(n === 2 || n === 3).toBe(true);
  });
  it('하나 버거움 + 하나 편함이면 버거운 쪽을 먼저', () => {
    const f = mbtiFeelings('관성', 'ISFJ'); // J 편함, F 버거움
    expect(f.combination).toBe('하나 버거움 + 하나 편함');
    expect(f.axes.map((a) => `${a.side}${a.feeling}`)).toEqual(['F버거움', 'J편함']);
  });
  it('둘 다 편함', () => expect(mbtiFeelings('인성', 'INTP').combination).toBe('둘 다 편함'));
  it('세운 천간·지지 그룹이 다르면 보조 문장', () => {
    // 일간 甲, 丙午년: 丙 = 식신(식상), 午 본기 丁 = 상관(식상) → 보조 없음 / 일간 甲, 庚子년: 庚 = 편관, 子 본기 癸 = 정인 → 보조
    expect(analyzeSeun('甲', { stem: '丙', branch: '午' }).needsSubSentence).toBe(false);
    expect(analyzeSeun('甲', { stem: '庚', branch: '子' })).toMatchObject({ theme: '관성', branchGroup: '인성', needsSubSentence: true });
  });
  it('MBTI 형식 검증', () => {
    expect(parseMbti(' infp ')).toBe('INFP');
    expect(() => parseMbti('INFX')).toThrow();
  });
});

describe('5-8 강도 판정 경계', () => {
  // judgeAxis 는 점수의 2배(정수)를 받는다
  it('|score| = 0.5 는 뚜렷 (경계 포함)', () => expect(judgeAxis('E/I', 'E', 'I', 9, 3).strength).toBe('뚜렷'));
  it('|score| = 0.2 는 약간 (경계 포함)', () => expect(judgeAxis('E/I', 'E', 'I', 6, 4).strength).toBe('약간'));
  it('|score| < 0.2 는 균형', () => expect(judgeAxis('T/F', 'T', 'F', 8, 6).strength).toBe('균형'));
  it('합이 0 이면 균형', () => expect(judgeAxis('N/S', 'N', 'S', 0, 0)).toMatchObject({ strength: '균형', score: 0, direction: null }));
  it('합이 2 미만이면 최대 약간 (1.5 vs 0 → 원래 뚜렷이지만 약간)', () => {
    expect(judgeAxis('N/S', 'N', 'S', 3, 0)).toMatchObject({ strength: '약간', direction: 'N' });
  });
  it('합이 정확히 2 면 제한 없음 (2 vs 0 → 뚜렷)', () => expect(judgeAxis('N/S', 'N', 'S', 4, 0).strength).toBe('뚜렷'));
});

describe('MBTI 변화 해석', () => {
  const r = calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 23, time: { hour: 9, minute: 0 }, birthplaceCode: '47170' });
  if (r.status !== 'ok') throw new Error();
  const scores = sajuAxisScores(r.chart); // E 뚜렷, S 약간, T/F 균형, P 뚜렷
  it('타고난 쪽으로 / 멀어짐 / 균형 축', () => {
    expect(classifyMbtiChange(scores, 'INFP', 'ESTJ')).toEqual([
      { axis: 'E/I', from: 'I', to: 'E', kind: '타고난 쪽으로' },
      { axis: 'N/S', from: 'N', to: 'S', kind: '타고난 쪽으로' },
      { axis: 'T/F', from: 'F', to: 'T', kind: '균형 축의 변화' },
      { axis: 'J/P', from: 'P', to: 'J', kind: '타고난 쪽에서 멀어짐' },
    ]);
  });
});
