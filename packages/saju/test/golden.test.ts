// CLAUDE.md 에 "검증 완료"로 적힌 케이스. 이 파일의 기대값은 문서와 1:1 로 대응해야 한다.
import { describe, expect, it } from 'vitest';
import {
  analyzeSeun, calculateSaju, compareWithMbti, dominantSeun, mbtiFeelings, pillarText, sajuAxisScores,
  type SajuChart,
} from '../src/index.ts';

const ANDONG = '47170';

function okChart(r: ReturnType<typeof calculateSaju>): SajuChart {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`);
  return r.chart;
}

describe('5-1 필수 테스트: 1996-02-23(양력) 09:00 경북 안동', () => {
  const r = calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 23, time: { hour: 9, minute: 0 }, birthplaceCode: ANDONG });
  const chart = okChart(r);

  it('丙子년 庚寅월 庚寅일 庚辰시', () => {
    const p = chart.pillars;
    expect([p.year, p.month, p.day, p.hour!].map(pillarText)).toEqual(['丙子', '庚寅', '庚寅', '庚辰']);
  });

  it('진태양시(경도) 보정 시 약 08:35, 보정 전후 모두 辰시', () => {
    expect(r.time.localMeanTime).toBe('1996-02-23 08:35');
    expect(r.time.clock).toBe('1996-02-23 09:00');
    expect(r.notices).toEqual([]);
  });
});

describe('5-8 연결 규칙 테스트: 丙子 庚寅 庚寅 庚辰, INFP', () => {
  const chart = okChart(
    calculateSaju({ calendar: 'solar', year: 1996, month: 2, day: 23, time: { hour: 9, minute: 0 }, birthplaceCode: ANDONG }),
  );

  it('글자별 음양(본기)·오행·십신 표', () => {
    const rows = chart.glyphs.map((g) => [g.char, g.yinYang, g.element, g.tenGod]);
    expect(rows).toEqual([
      ['丙', '양', '火', '편관'],
      ['子', '음', '水', '상관'],
      ['庚', '양', '金', '비견'],
      ['寅', '양', '木', '편재'],
      ['庚', '양', '金', null],
      ['寅', '양', '木', '편재'],
      ['庚', '양', '金', '비견'],
      ['辰', '양', '土', '편인'],
    ]);
    expect(chart.glyphs.map((g) => g.mainQi)).toEqual(['丙', '癸', '庚', '甲', '庚', '甲', '庚', '戊']);
  });

  it('축별 점수·판정·실제 비교', () => {
    const cmp = compareWithMbti(sajuAxisScores(chart), 'INFP');
    const summary = cmp.map((a) => ({
      axis: a.axis, left: a.left, right: a.right, strength: a.strength, direction: a.direction, match: a.match,
    }));
    expect(summary).toEqual([
      { axis: 'E/I', left: 4.5, right: 1.5, strength: '뚜렷', direction: 'E', match: '불일치' },
      { axis: 'N/S', left: 1, right: 2, strength: '약간', direction: 'S', match: '불일치' },
      { axis: 'T/F', left: 4, right: 3, strength: '균형', direction: null, match: null },
      { axis: 'J/P', left: 0, right: 5, strength: '뚜렷', direction: 'P', match: '일치' },
    ]);
    expect(cmp[0]!.score).toBe(0.5); // 경계값: ≥ 0.5 는 '뚜렷'
    expect(cmp[1]!.score).toBeCloseTo(-0.33, 2);
    expect(cmp[2]!.score).toBeCloseTo(0.14, 2);
    expect(cmp[3]!.score).toBe(-1);
  });
});

describe('5-2 매핑 테스트: 일간 庚, 2026-10-03 → 다음 생일 2027-02-23', () => {
  const seun = dominantSeun({ year: 2026, month: 10, day: 3 }, { year: 2027, month: 2, day: 23 });

  it('입춘 2027-02-04 기준, 기간 대부분이 丙午년', () => {
    expect(pillarText(seun.pillar)).toBe('丙午');
    expect(seun.shares.map((s) => pillarText(s.pillar))).toEqual(['丙午', '丁未']);
    expect(seun.shares[0]!.days).toBeGreaterThan(seun.shares[1]!.days);
  });

  it('丙 = 편관 → 관성 주 테마, 午(본기 丁) = 정관 → 같은 그룹이라 보조 문장 없음', () => {
    const a = analyzeSeun('庚', seun.pillar);
    expect(a).toMatchObject({
      stemTenGod: '편관', theme: '관성', tone: '갑작스럽고 강한 압박',
      branchMainQi: '丁', branchTenGod: '정관', branchGroup: '관성', needsSubSentence: false,
    });
  });

  it('INFP → J/P: P 버거움, T/F: F 버거움 → 둘 다 버거움', () => {
    const f = mbtiFeelings('관성', 'INFP');
    expect(f.axes).toEqual([
      { axis: 'J/P', side: 'P', feeling: '버거움' },
      { axis: 'T/F', side: 'F', feeling: '버거움' },
    ]);
    expect(f.combination).toBe('둘 다 버거움');
  });

  it('다음 주기 丁未년: 丁 = 정관(관성 주 테마), 未(본기 己) = 정인(인성 보조 문장)', () => {
    const a = analyzeSeun('庚', { stem: '丁', branch: '未' });
    expect(a).toMatchObject({
      stemTenGod: '정관', theme: '관성', branchMainQi: '己', branchTenGod: '정인', branchGroup: '인성', needsSubSentence: true,
    });
  });
});
