// 연·월·일·시주 계산과 원국(글자별 음양·오행·십신) 구성.
import {
  BRANCHES, BRANCH_MAIN_QI, STEMS, STEMS_KO, BRANCHES_KO,
  branchIndex, sexagenary, stemElement, stemIndex, stemYinYang, tenGodOf,
  type Branch, type Element, type Stem, type TenGod, type YinYang,
} from './constants.ts';
import type { CivilDate } from './time.ts';

export interface Pillar {
  stem: Stem;
  branch: Branch;
}

export function pillarText(p: Pillar): string {
  return p.stem + p.branch;
}
export function pillarKorean(p: Pillar): string {
  return STEMS_KO[stemIndex(p.stem)]! + BRANCHES_KO[branchIndex(p.branch)]!;
}

/** 연주: 입춘 기준 사주 연도 → 간지. 서기 4년 = 甲子 */
export function yearPillar(sajuYear: number): Pillar {
  return sexagenary(sajuYear - 4);
}

/** 월주: 월지는 절입으로 정해지고, 월간은 연간에 따른 연두법(年頭法)으로 정한다. 甲己년 寅월 = 丙寅 */
export function monthPillar(yearStem: Stem, monthBranch: Branch): Pillar {
  const firstStem = ((stemIndex(yearStem) % 5) * 2 + 2) % 10; // 寅월의 천간
  const offset = (branchIndex(monthBranch) - 2 + 12) % 12; // 寅=0
  return { stem: STEMS[(firstStem + offset) % 10]!, branch: monthBranch };
}

/** 그레고리력 율리우스일수(JDN) */
export function julianDayNumber(c: CivilDate): number {
  const a = Math.floor((14 - c.month) / 12);
  const y = c.year + 4800 - a;
  const m = c.month + 12 * a - 3;
  return (
    c.day + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  );
}

/** 일주: 60갑자 순환. JDN 2451545(2000-01-01) = 戊午(54) */
export function dayPillar(c: CivilDate): Pillar {
  return sexagenary(julianDayNumber(c) + 49);
}

/** 시지: 子시 = 23:00~01:00, 이후 2시간 단위. minuteOfDay 는 지방시 기준 자정부터의 분 */
export function hourBranchOf(minuteOfDay: number): Branch {
  return BRANCHES[Math.floor((minuteOfDay + 60) / 120) % 12]!;
}

/** 시주: 시두법(時頭法). 甲己일 子시 = 甲子 */
export function hourPillar(dayStemForHour: Stem, hourBranch: Branch): Pillar {
  const first = (stemIndex(dayStemForHour) % 5) * 2;
  return { stem: STEMS[(first + branchIndex(hourBranch)) % 10]!, branch: hourBranch };
}

export type GlyphPosition =
  | 'year.stem' | 'year.branch' | 'month.stem' | 'month.branch'
  | 'day.stem' | 'day.branch' | 'hour.stem' | 'hour.branch';

export interface Glyph {
  position: GlyphPosition;
  char: Stem | Branch;
  /** 천간이면 자기 자신, 지지면 본기 */
  mainQi: Stem;
  yinYang: YinYang;
  element: Element;
  /** 일간 기준 십신. 일간 자신은 null */
  tenGod: TenGod | null;
}

export interface SajuChart {
  pillars: { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null };
  dayMaster: Stem;
  /** 년간·년지·월간·월지·일간·일지·시간·시지 순. 시간 모름이면 6개 */
  glyphs: Glyph[];
}

export function buildChart(pillars: SajuChart['pillars']): SajuChart {
  const dayMaster = pillars.day.stem;
  const glyphs: Glyph[] = [];
  const order = [['year', pillars.year], ['month', pillars.month], ['day', pillars.day], ['hour', pillars.hour]] as const;
  for (const [name, p] of order) {
    if (!p) continue;
    const stemPos = `${name}.stem` as GlyphPosition;
    glyphs.push({
      position: stemPos,
      char: p.stem,
      mainQi: p.stem,
      yinYang: stemYinYang(p.stem),
      element: stemElement(p.stem),
      tenGod: stemPos === 'day.stem' ? null : tenGodOf(dayMaster, p.stem),
    });
    const qi = BRANCH_MAIN_QI[p.branch];
    glyphs.push({
      position: `${name}.branch` as GlyphPosition,
      char: p.branch,
      mainQi: qi,
      yinYang: stemYinYang(qi),
      element: stemElement(qi),
      tenGod: tenGodOf(dayMaster, qi),
    });
  }
  return { pillars, dayMaster, glyphs };
}
