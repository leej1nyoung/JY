import { describe, expect, it } from 'vitest';
import { SECOND_PAGE_SYSTEM, checkSecondPage, createSecondPageContext, followingBirthday, secondPagePrompt, type FirstLetterRequest } from '../src/index.ts';

const BASE: FirstLetterRequest = {
  calendar: 'solar', year: 1996, month: 2, day: 23, isLeapMonth: false, time: { hour: 9, minute: 0 },
  birthplaceCode: '47170', mbti: 'INFP', name: '진영', birthdayBasis: 'solar', confirmSelf: true, confirmAge: true,
};
const CREATED = new Date('2026-10-03T03:00:00Z');

function ctx() {
  const r = createSecondPageContext(BASE, CREATED);
  if (!r.ok) throw new Error(r.message);
  return r.context;
}

const GOOD = {
  moment: '하던 걸 다 내려놓고 아홉 시에 불을 껐어. 휴대폰도 머리맡이 아니라 책상 위에 두고.\n\n별거 아닌 일 같지만, 그 주 내내 날이 서 있던 내가 그날 밤 처음으로 푹 잤어. 다음 날 아침에 알람보다 먼저 눈이 떠졌는데, 창밖이 이상하게 맑아 보이더라. 그날부터 조금씩 다시 내 속도로 걸을 수 있었어.\n\n그러니까 고마워. 그날 멈춰 준 거. 그게 아니었으면 나는 지금보다 훨씬 지쳐 있었을 테니까. 버스 창에 기대서 졸던 날들도 그 뒤로는 조금 덜 서글펐어.',
  flow: '다음 생일부터 1년은 지금보다 조금 차분한 결이래. 해야 할 일은 여전히 있지만, 그걸 누가 등 떠밀기보다는 차례대로 놓여 있는 느낌일 것 같아.\n\n그 사이사이 누군가한테 배우거나 도움받을 일이 생길 것 같아. 그럴 땐 괜찮은 척하지 말고 그냥 받아. 받는 것도 연습이 필요하더라.\n\n아마 지금처럼 갑자기 쏟아지는 날은 줄고, 대신 매일 조금씩 해야 하는 일이 생길 것 같아. 그런 일은 빨리 끝내려고 하면 더 지치더라. 하루에 하나씩, 저녁 먹기 전까지만 하고 덮는 식으로 가 보자.',
  request: '힘들 땐 하루쯤 먼저 불을 꺼 줘.',
};

describe('두 번째 장 재료 (CLAUDE.md 5-2 매핑 케이스)', () => {
  const c = ctx();
  it('지금부터 다음 생일까지: 편관(갑작스럽고 강한 압박), P·F 둘 다 버거움', () => {
    expect(c.span).toBe('다섯 달');
    expect(c.current.tone).toBe('갑작스럽고 강한 압박');
    expect(c.current.combination).toBe('둘 다 버거움');
    expect(c.current.aside).toBeNull();
  });
  it('다음 생일부터 1년: 2027-02-23 ~ 2028-02-23, 丁未년 → 정관(질서 있는 책임), 지지 未는 인성이라 곁들이는 기운 있음', () => {
    expect(c.next.from).toEqual({ year: 2027, month: 2, day: 23 });
    expect(c.next.to).toEqual({ year: 2028, month: 2, day: 23 });
    expect(c.next.tone).toBe('질서 있는 책임');
    expect(c.next.aside).toContain('배우고 생각하고');
  });
  it('봉투 목차와 같은 시점 (일지 寅과 합하는 11월)', () => {
    expect(c.moment.label).toMatch(/11월$/);
    expect(c.moment.meaning).toBe('마음이 가장 놓였던 달');
  });
  it('AI 에 생년월일·출생지·이름을 넘기지 않는다', () => {
    const prompt = SECOND_PAGE_SYSTEM + secondPagePrompt(c);
    for (const s of ['1996', '02-23', '안동', '47170', '진영']) expect(prompt).not.toContain(s);
  });
  it('첫 장을 만든 순간으로 다시 계산하면 같은 첫 장이 나온다', () => {
    expect(ctx().firstPage).toEqual(c.firstPage);
  });
});

describe('두 번째 장 결과 검사', () => {
  const c = ctx();
  it('규칙을 지킨 결과는 통과', () => {
    const r = checkSecondPage(GOOD, c);
    expect(r.problems).toEqual([]);
    expect(r.page!.moment).toHaveLength(3);
  });
  it('명리 용어·유형 이름·직업 짐작·짐작 말투를 잡아낸다', () => {
    const bad = { ...GOOD, flow: GOOD.flow + ' 정관의 해라 회사 일이 많을 거야. INFP 라서 더 그랬을 거야.' };
    const problems = checkSecondPage(bad, c).problems.join(' ');
    for (const w of ['정관', '회사', '~을 거야', '유형 이름']) expect(problems).toContain(w);
  });
  it('끊긴 문장의 끝을 되풀이하며 시작하면 다시 쓰게 한다', () => {
    const tail = c.cut.split(' ').slice(-2).join(' ');
    expect(checkSecondPage({ ...GOOD, moment: `${tail} ${GOOD.moment}` }, c).problems.join(' ')).toContain('되풀이');
  });
  it('칸이 비거나 형식이 다르면 실패', () => {
    expect(checkSecondPage({ moment: 'x' }, c).page).toBeNull();
  });
});

describe('다음 생일 다음의 생일', () => {
  it('양력', () => {
    expect(followingBirthday({ year: 1996, month: 2, day: 23 }, 'solar', { year: 2027, month: 2, day: 23 })).toEqual({ year: 2028, month: 2, day: 23 });
  });
  it('2월 29일생', () => {
    expect(followingBirthday({ year: 2000, month: 2, day: 29 }, 'solar', { year: 2027, month: 2, day: 28 })).toEqual({ year: 2028, month: 2, day: 29 });
  });
  it('음력 (음력 1월 5일생: 2027-02-11 다음은 2028년 음력 1월 5일)', () => {
    const next = followingBirthday({ year: 1996, month: 2, day: 23 }, 'lunar', { year: 2027, month: 2, day: 11 });
    expect(next.year).toBe(2028);
    expect(next.month).toBe(1); // 2028년 음력 1월 5일 = 양력 1월 말~2월 초
  });
});
