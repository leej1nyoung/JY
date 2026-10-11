import { describe, expect, it } from 'vitest';
import {
  checkFirstPage, createFirstPageContext, evalProfiles, firstPagePrompt, FIRST_PAGE_SYSTEM, letterType, parseCheckin, summarize,
  type Checkin, type EvalResult, type FirstLetterRequest,
} from '../src/index.ts';

const JIN: FirstLetterRequest = {
  calendar: 'solar', year: 1996, month: 2, day: 23, isLeapMonth: false, time: { hour: 9, minute: 0 },
  birthplaceCode: '47170', mbti: 'INFP', name: '진영', birthdayBasis: 'solar', confirmSelf: true, confirmAge: true,
};
const WIFE: FirstLetterRequest = { ...JIN, year: 1997, month: 4, day: 7, time: { hour: 11, minute: 59 }, birthplaceCode: '11350', mbti: 'ISFJ', name: null };
const AT = new Date('2026-10-11T03:00:00Z'); // 한국 10월 11일 일요일 낮
const JIN_CHECK: Checkin = { focus: '해야 할 일', mood: '지쳐 있음', wish: '사람과 가까워지고 싶음', coping: '좋아하는 걸 하며 푼다', time: '가까운 사람 한두 명과' };
const WIFE_CHECK: Checkin = { focus: '앞으로의 방향', mood: '복잡함', wish: '쉬고 싶음', coping: '일단 잔다', time: '대부분 혼자' };

function ctxOf(req: FirstLetterRequest, c: Checkin) {
  const r = createFirstPageContext(req, c, AT);
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe('편지 유형 판정 (손편지 예시와 같은 결과)', () => {
  it('진영: 편관 시기 P·F 둘 다 버거움 + 지쳐 있음 → 이것만은 지켜', () => {
    const r = ctxOf(JIN, JIN_CHECK);
    expect(r.context.type).toBe('이것만은 지켜');
    expect(r.context.span).toBe('넉 달');
    expect(r.context.toc).toEqual(['이 넉 달 동안 딱 하나 조심할 것', '11월, 미뤄 둔 걸 꺼내기 좋은 달', '2월 23일 생일부터 1년의 흐름', '미래의 내가 꼭 부탁하고 싶은 한 가지']);
    expect(r.context.sajuVsMbti.join(' ')).toContain('E/I: 사주로 보면 뚜렷하게 E 쪽인데, 실제는 I');
    expect(r.context.ipchunInPeriod).toBe(true);
    expect(r.greeting).toBe('진영아, 생일 축하해. 다음 생일의 나야.');
  });
  it('아내: 정인 시기 S 버거움·I 편함 + 앞으로의 방향 → 방향을 고를 때, 10월이 잘 풀리는 달', () => {
    const r = ctxOf(WIFE, WIFE_CHECK);
    expect(r.context.type).toBe('방향을 고를 때');
    expect(r.context.span).toBe('여섯 달');
    expect(r.context.toc[1]).toBe('10월, 미뤄 둔 걸 꺼내기 좋은 달');
    expect(r.context.nature.image).toBe('씨앗을 품어 기르는 밭');
    expect(r.greeting).toBe('생일 축하해. 다음 생일의 나야.');
  });
  it('규칙 표', () => {
    const c = (mood: Checkin['mood'], focus: Checkin['focus'] = '해야 할 일', wish: Checkin['wish'] = '쉬고 싶음'): Checkin => ({ focus, mood, wish, coping: '혼자 삭인다', time: '대부분 혼자' });
    expect(letterType('둘 다 편함', c('지쳐 있음'))).toBe('이번엔 잡아');
    expect(letterType('하나 버거움 + 하나 편함', c('무난함', '해야 할 일', '정리하고 싶음'))).toBe('방향을 고를 때');
    expect(letterType('둘 다 버거움', c('무난함', '앞으로의 방향'))).toBe('미리 알려 줄게');
    expect(letterType('둘 다 버거움', c('복잡함'))).toBe('이것만은 지켜');
    expect(letterType('하나 버거움 + 하나 편함', c('들떠 있음'))).toBe('미리 알려 줄게');
  });
  it('체크인 검사', () => {
    expect(parseCheckin(JIN_CHECK)).toEqual(JIN_CHECK);
    expect(parseCheckin({ ...JIN_CHECK, mood: '행복함' })).toBeNull();
    expect(parseCheckin({ ...JIN_CHECK, coping: undefined })).toBeNull();
  });
});

describe('AI 에 넘기는 재료', () => {
  it('생년월일·출생지·이름을 넘기지 않는다', () => {
    const p = FIRST_PAGE_SYSTEM + firstPagePrompt(ctxOf(JIN, JIN_CHECK).context);
    for (const s of ['1996', '안동', '47170', '진영']) expect(p).not.toContain(s);
  });
});

const GOOD = {
  now: '10월 11일 일요일이네. 내일 또 한 주가 시작된다는 게 벌써 좀 무겁지? 딱 그때의 너한테 써 보려고 해.',
  nature: '사주로 보면 너는 겉은 단단한 쇠 같은 사람이래. 한번 정하면 끝까지 가는. 근데 속은 말 한마디에도 오래 마음이 쓰이는 편이지?',
  present: '요즘은 할 일은 줄 서 있는데 몸은 벌써 지쳐 있지? 보고 싶은 사람한테 연락하는 것도 자꾸 다음으로 미뤄지고.',
  ahead: '겁주려는 건 아닌데, 이 넉 달은 일이 예고 없이 떨어지는 때야. 내가 정한 순서대로 흘러가는 날이 거의 없었어. 지친 채로 들어가면 생각보다 금방 바닥나.',
  cut: '그래서 하나만 미리 말해 줄게. 나 이거 하나 때문에 이 넉 달을 거의 날렸거든. 너는 꼭',
};

describe('첫 장 결과 검사', () => {
  const ctx = ctxOf(JIN, JIN_CHECK).context;
  it('규칙을 지킨 결과는 통과하고, 마지막 문단이 끊긴 문장', () => {
    const r = checkFirstPage(GOOD, ctx);
    expect(r.problems).toEqual([]);
    expect(r.page!.paragraphs.at(-1)).toBe(GOOD.cut);
  });
  it('끊기가 문장으로 끝나면 다시 쓰게 한다', () => {
    expect(checkFirstPage({ ...GOOD, cut: GOOD.cut + ' 쉬어.' }, ctx).problems.join(' ')).toContain('문장 중간');
  });
  it('AI 말버릇·유형 이름·달 이름·짐작 말투를 잡는다', () => {
    const bad = { ...GOOD, ahead: GOOD.ahead + ' 일이 많은 게 아니었어. 그건 INFP 라서 그랬을 거야. 11월엔 쉬어.' };
    const p = checkFirstPage(bad, ctx).problems.join(' ');
    for (const w of ['반전 틀', '유형 이름', '달 이름', '~을 거야']) expect(p).toContain(w);
  });
  it('예고·흔한 위로·"이번 생일"·"나도 이맘때" 짐작을 잡는다', () => {
    const p = checkFirstPage({ ...GOOD, now: GOOD.now + ' 나도 이맘때 휴대폰만 봤어.', ahead: '따끔하게 말할게. ' + GOOD.ahead + ' 이번 생일까지 겁먹지 마.' }, ctx).problems.join(' ');
    for (const w of ['예고', '흔한 위로', '다음 생일', '짐작하기']) expect(p).toContain(w);
  });
});

describe('자동 검사용 가상 인물', () => {
  it('같은 시각이면 늘 같은 40명, 유형 4가지가 10명씩', () => {
    const a = evalProfiles(40, AT);
    expect(a).toHaveLength(40);
    expect(evalProfiles(40, AT)).toEqual(a);
    const types = a.map((p) => { const r = createFirstPageContext(p.req, p.checkin, AT); return r.ok ? r.context.type : 'x'; });
    for (const t of ['미리 알려 줄게', '이것만은 지켜', '이번엔 잡아', '방향을 고를 때']) expect(types.filter((x) => x === t)).toHaveLength(10);
  });
  it('요약: 주인 맞히기 정확도와 가장 나쁜 3통', () => {
    const base = { summary: '', letter: '', failed: null, attempts: 1, ruleProblems: [], tokens: { input: 0, output: 0 }, type: '이번엔 잡아' as const };
    const results: EvalResult[] = [
      { ...base, id: 1, who: { correct: true, pick: 1, answer: 1, reason: '' }, quality: { unfounded: [], aiTone: [], specificity: 5, curiosity: 5, hitLine: '' } },
      { ...base, id: 2, who: { correct: false, pick: 2, answer: 1, reason: '' }, quality: { unfounded: ['x'], aiTone: [], specificity: 2, curiosity: 3, hitLine: '' } },
      { ...base, id: 3, failed: 'rules', who: null, quality: null },
    ];
    const s = summarize(results);
    expect(s.whoAccuracy).toBe(50);
    expect(s.noUnfounded).toBe(1);
    expect(s.worst.map((r) => r.id)).toEqual([3, 2, 1]);
  });
});
