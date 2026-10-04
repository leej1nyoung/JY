// 독립 구현과의 대조. lunar-javascript(寿星万年历 알고리즘, 중국 개발)는 검증 전용 devDependency 이며 엔진에서 쓰지 않는다.
// 이 대조로 잡을 수 있는 것: 절기 계산·연월일주 공식의 구현 실수. (두 구현이 같은 실수를 할 가능성은 낮다)
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { dayPillar, jieOfYear, monthPillar, pillarText, sajuYearAt, surroundingJie, yearPillar } from '../src/index.ts';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Solar, Lunar } = require('lunar-javascript');

const CN: Record<string, string> = {
  소한: '小寒', 입춘: '立春', 경칩: '惊蛰', 청명: '清明', 입하: '立夏', 망종: '芒种',
  소서: '小暑', 입추: '立秋', 백로: '白露', 한로: '寒露', 입동: '立冬', 대설: '大雪',
};
const BEIJING = 8 * 3600_000;

function lunarJsTermUtc(year: number, name: string): number {
  for (const [ly, lm] of [[year, 6], [year, 11], [year - 1, 11], [year, 1]] as const) {
    const s = Lunar.fromYmd(ly, lm, 1).getJieQiTable()[CN[name]!];
    if (s && s.getYear() === year) {
      return Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond()) - BEIJING;
    }
  }
  throw new Error(`${year} ${name} not found`);
}

describe('절기 시각 대조 (1920~2050, 12절 × 131년)', () => {
  it('astronomy-engine 과 lunar-javascript 의 차이가 모두 60초 이내', () => {
    let max = 0;
    for (let y = 1920; y <= 2050; y++) {
      for (const e of jieOfYear(y)) max = Math.max(max, Math.abs(e.utcMs - lunarJsTermUtc(y, e.name)));
    }
    expect(max / 1000).toBeLessThan(60);
  });
});

describe('일주 대조', () => {
  it('1920-01-01 ~ 2050-12-31 매일, 한국 음력 라이브러리(KASI 기준)의 일진과 일치', () => {
    const cal = new KoreanLunarCalendar();
    for (let t = Date.UTC(1920, 0, 1); t <= Date.UTC(2050, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const c = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      cal.setSolarDate(c.year, c.month, c.day);
      if (!cal.getChineseGapja().day.startsWith(pillarText(dayPillar(c)))) throw new Error(d.toISOString());
    }
  });
});

describe('연주·월주 대조', () => {
  it('무작위 2만 개 시각(분 단위)에서 lunar-javascript 팔자의 연주·월주와 일치', () => {
    let seed = 20261004;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const lo = Date.UTC(1920, 0, 1);
    const span = Date.UTC(2050, 11, 31) - lo;
    for (let i = 0; i < 20_000; i++) {
      const t = lo + Math.floor((rnd() * span) / 60_000) * 60_000;
      const { prev, next } = surroundingJie(t);
      if (t - prev.utcMs < 120_000 || next.utcMs - t < 120_000) continue; // 두 구현의 절입 시각 차(<1분) 구간 제외
      const bj = new Date(t + BEIJING);
      const ec = Solar.fromYmdHms(bj.getUTCFullYear(), bj.getUTCMonth() + 1, bj.getUTCDate(), bj.getUTCHours(), bj.getUTCMinutes(), 0)
        .getLunar().getEightChar();
      const yp = yearPillar(sajuYearAt(t));
      const mp = monthPillar(yp.stem, prev.branch);
      if (ec.getYear() !== pillarText(yp) || ec.getMonth() !== pillarText(mp)) throw new Error(new Date(t).toISOString());
    }
  });
});
