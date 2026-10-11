// 편지 재료: 테마별 행동, 달의 계절감. 사람마다 코드가 골라 넘겨서 모든 편지가 같은 조언으로 쏠리지 않게 한다.
// 생활 장면(설거지·빨래 등)은 지어낸 티가 나서 쓰지 않는다.
import KoreanLunarCalendar from 'korean-lunar-calendar';
import type { CivilDate, TenGodGroup } from '@naite/saju';

/** 내가 그 시기에 해 보고 효과 있었던 행동 (세운 주 테마별). 이직·투자·연애 결정 지시는 넣지 않는다 */
export const THEME_ACTIONS: Readonly<Record<TenGodGroup, readonly string[]>> = {
  비겁: ['내 몫을 먼저 말로 꺼내기', '남이랑 비교하게 되는 걸 일부러 덜 보기', '혼자 있을 시간을 미리 빼 두기', '같이 하는 일에서 내 역할을 처음에 정해 두기'],
  식상: ['하고 싶은 말을 하루 묵혔다가 하기', '만든 걸 다 끝내기 전에 작게 먼저 보여 주기', '새로 벌이기 전에 하던 걸 하나 끝내기', '말이 세게 나간 날엔 그날 안에 한마디 덧붙이기'],
  재성: ['챙길 걸 한꺼번에 보지 말고 이번 주 것만 보기', '끝낸 걸 따로 세어 보기', '들어오고 나가는 걸 한 번에 정리해 보기', '잘된 결과는 그날 바로 남겨 두기'],
  관성: ['애매한 기준은 먼저 물어보기', '부탁 하나는 거절해 보기', '평가받은 날은 답을 하루 뒤에 하기', '내 몫이 아닌 일은 돌려주기'],
  인성: ['혼자 끙끙대지 말고 먼저 물어보기', '배운 걸 하나라도 바로 써먹기', '생각만 하던 걸 날짜 정해서 시작하기', '도와준 사람한테 고맙다고 말하기'],
};

/** 문자열 → 32비트 해시 (FNV-1a). 같은 사람이면 늘 같은 걸 고른다 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** 목록에서 seed 로 n개를 겹치지 않게 고른다 */
export function pickBySeed<T>(list: readonly T[], seed: string, n: number): T[] {
  const idx = list.map((_, i) => i).sort((a, b) => hash(`${seed}#${a}`) - hash(`${seed}#${b}`));
  return idx.slice(0, n).map((i) => list[i]!);
}

const MONTH_AIR: Readonly<Record<number, string>> = {
  1: '한 해가 막 시작되는 한겨울', 2: '아직 추운 늦겨울', 3: '꽃샘추위가 오가는 초봄', 4: '꽃이 피는 봄', 5: '공휴일이 끼어 있는 늦봄',
  6: '더워지기 시작하는 초여름', 7: '장마철', 8: '한여름 더위', 9: '아침저녁이 선선해지는 초가을', 10: '단풍이 드는 가을',
  11: '첫 추위가 오는 늦가을', 12: '한 해를 마무리하는 연말',
};

function lunarToSolarMonth(year: number, month: number, day: number): number | null {
  const cal = new KoreanLunarCalendar();
  if (!cal.setLunarDate(year, month, day, false)) return null;
  return cal.getSolarCalendar().month;
}

/**
 * 기간 안의 그 달에 대한 계절감 한 줄. 설·추석이 그 달에 있으면 덧붙인다 (음력 1/1, 8/15 를 양력으로 바꿔 확인).
 * 예: 2월 → "아직 추운 늦겨울, 설 연휴가 있는 달"
 */
export function monthNote(month: number, from: CivilDate, to: CivilDate): string {
  const years: number[] = [];
  for (let y = from.year; y <= to.year; y++) {
    const afterStart = y > from.year || month >= from.month;
    const beforeEnd = y < to.year || month <= to.month;
    if (afterStart && beforeEnd) years.push(y);
  }
  const year = years[0] ?? from.year;
  const extra: string[] = [];
  if (lunarToSolarMonth(year, 1, 1) === month) extra.push('설 연휴가 있는 달');
  if (lunarToSolarMonth(year, 8, 15) === month) extra.push('추석 연휴가 있는 달');
  return [MONTH_AIR[month]!, ...extra].join(', ');
}
