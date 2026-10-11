import { describe, expect, it } from 'vitest';
import { branchRelation, isNobleHelper, keyMonthOf, monthlyGuide } from '../src/monthly.ts';

describe('월별 공략 달력', () => {
  // 진영: 庚寅일, INFP, 2026-10-11 ~ 다음 생일 2027-02-23
  const months = monthlyGuide('庚', '寅', 'INFP', { year: 2026, month: 10, day: 11 }, { year: 2027, month: 2, day: 23 });
  const row = (i: number) => {
    const m = months[i]!;
    return `${m.start.month}/${m.start.day}~${m.end.month}/${m.end.day} ${m.pillar.stem}${m.pillar.branch} ${m.tenGod} ${m.relation ?? '-'} ${m.helper ? '귀인' : '-'} ${m.verdict}`;
  };
  it('절입 기준으로 달을 나누고, 기간 밖은 자른다', () => {
    expect(months.map((_, i) => row(i))).toEqual([
      '10/11~11/6 戊戌 편인 - - 괜찮은 달',
      '11/7~12/6 己亥 정인 합 - 잘 풀리는 달',
      '12/7~1/4 庚子 비견 - - 버거운 달',
      '1/5~2/3 辛丑 겁재 - 귀인 흔들리기 쉬운 달',
      '2/4~2/22 壬寅 식신 - - 무난한 달',
    ]);
  });
  it('끊기는 달: 버거운 유형은 가장 낮은 달, 이번엔 잡아는 가장 높은 달', () => {
    expect(keyMonthOf(months, false)!.month).toBe(1);
    expect(keyMonthOf(months, true)!.month).toBe(11);
  });
  it('지지 관계: 충 > 합 > 형 > 원진, 파·해는 보지 않는다', () => {
    expect(branchRelation('申', '寅')).toBe('충');
    expect(branchRelation('亥', '寅')).toBe('합'); // 寅亥는 합이자 파 → 합
    expect(branchRelation('巳', '寅')).toBe('형'); // 寅巳 형(해이기도 함)
    expect(branchRelation('酉', '寅')).toBe('원진');
    expect(branchRelation('卯', '子')).toBe('형'); // 子卯 상형
    expect(branchRelation('午', '午')).toBe('형'); // 자형
    expect(branchRelation('寅', '寅')).toBeNull();
    expect(branchRelation('辰', '卯')).toBeNull(); // 卯辰 해 → 쓰지 않음
  });
  it('천을귀인 표', () => {
    expect(isNobleHelper('庚', '丑')).toBe(true);
    expect(isNobleHelper('庚', '未')).toBe(true);
    expect(isNobleHelper('辛', '寅')).toBe(true);
    expect(isNobleHelper('壬', '卯')).toBe(true);
    expect(isNobleHelper('丙', '亥')).toBe(true);
    expect(isNobleHelper('乙', '申')).toBe(true);
    expect(isNobleHelper('庚', '寅')).toBe(false);
  });
});

describe('끊기는 달 동점 처리', () => {
  it('좋은 달이 동점이면 합이 있는 달을 고른다 (서연: 壬子일 ESTJ, 1년)', () => {
    const months = monthlyGuide('壬', '子', 'ESTJ', { year: 2026, month: 10, day: 11 }, { year: 2027, month: 8, day: 15 });
    const best = keyMonthOf(months, true)!;
    expect(best.month).toBe(1);
    expect(best.relation).toBe('합');
  });
});
