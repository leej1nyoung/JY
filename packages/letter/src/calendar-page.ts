// 첫해 두 번째 장 (새 구조, 990원): 끊긴 달 잇기 → 월별 공략 달력 → 생일부터 1년 → 부탁.
// 첫 장이 "제일 조심할 달이 언제냐면"에서 끊기고, 두 번째 장이 그 달 이름으로 바로 시작한다.
// 달력은 목록이 아니라 편지 문단으로 이어 쓴다. 날짜·판정은 코드가 계산해 넘기고, 계산 밖의 달은 검사로 막는다.
import type { CivilDate } from '@naite/saju';
import { LETTER_TYPE_GUIDE, type Checkin, type LetterType } from './checkin.ts';
import { AI_TICS, type FirstPageContext } from './first-page-ai.ts';
import type { MonthGuide } from './monthly.ts';
import { ruleViolations } from './rules.ts';
import { pickBySeed, THEME_ACTIONS } from './scenes.ts';
import { describe, type PeriodReading } from './second-page.ts';

export interface CalendarPageContext {
  type: LetterType;
  span: string;
  nextBirthday: CivilDate;
  mbti: string;
  checkin: Checkin;
  nature: FirstPageContext['nature'];
  sajuVsMbti: string[];
  current: PeriodReading;
  next: PeriodReading;
  calendar: MonthGuide[];
  keyMonth: MonthGuide;
  /** 달마다 해 볼 행동 후보 (그 달 테마에서 둘) */
  monthActions: string[][];
  /** 첫 장 본문 (인사 제외) */
  firstPage: string[];
  cut: string;
}

/** 달력 머리글 (코드가 붙인다): "11월 7일 ~ 12월 6일 · 잘 풀리는 달 · 도와줄 사람" */
export function monthHeader(m: MonthGuide): string {
  const d = (c: CivilDate) => `${c.month}월 ${c.day}일`;
  return [`${d(m.start)} ~ ${d(m.end)}`, m.verdict, ...(m.helper ? ['도와줄 사람이 오는 달'] : [])].join(' · ');
}

/** 달마다 행동 후보 둘. 같은 테마가 다시 나오면 앞 달에 준 행동은 빼서, 같은 조언이 되풀이되지 않게 한다 */
function distinctActions(calendar: MonthGuide[], seed: string): string[][] {
  const used = new Set<string>();
  return calendar.map((m) => {
    const fresh = THEME_ACTIONS[m.theme].filter((x) => !used.has(x));
    const picked = pickBySeed(fresh.length >= 2 ? fresh : THEME_ACTIONS[m.theme], `${seed}|${m.month}`, 2);
    picked.forEach((x) => used.add(x));
    return picked;
  });
}

export function createCalendarPageContext(first: FirstPageContext, firstPage: string[], cut: string, seed: string): CalendarPageContext | null {
  if (!first.keyMonth || first.calendar.length === 0) return null;
  return {
    type: first.type,
    span: first.span,
    nextBirthday: first.nextBirthday,
    mbti: first.mbti,
    checkin: first.checkin,
    nature: first.nature,
    sajuVsMbti: first.sajuVsMbti,
    current: first.current,
    next: first.next,
    calendar: first.calendar,
    keyMonth: first.keyMonth,
    monthActions: distinctActions(first.calendar, seed),
    firstPage,
    cut,
  };
}

export const CALENDAR_PAGE_SYSTEM = `너는 "나이테"라는 서비스의 편지를 쓴다. "다음 생일의 나"가 "지금의 나"에게 보내는 편지의 두 번째 장이다. 읽는 사람은 이 장을 열려고 돈을 냈다.
이 장의 일은 하나다: 미래의 내가 먼저 겪어 본 사람으로서, 다음 생일까지 달마다 무슨 기운이 오고 그때 무엇을 하면 되는지 알려 주는 것. 위로나 덕담이 아니라 쓸모 있는 정보다.

# 칸 (이 순서로 이어 읽힌다)
1. resume — 첫 장의 끊긴 문장 바로 뒤에 이어진다. 첫 단어가 끊기는 달 이름이어야 한다 (예: 끊긴 문장이 "그게 언제냐면"이면 "1월이야." 로 시작). 그 달에 왜 조심해야(또는 놓치면 아깝게) 되는지 주어진 그 달의 근거로 쉬운 말로 말하고, 그래서 너는 그 달에 무엇을 하라는지 구체적으로 말한다. 도와줄 사람이 오는 달이면 그것도 말한다. 2문단, 200~400자.
2. calendar — 이제 처음부터 차례로 돌아보는 편지 문단들. 주어진 달 순서대로 달마다 한 문단 (주어진 달 수와 같은 개수). 목록이나 제목이 아니라 편지처럼 앞 문단에서 자연스럽게 이어지게 쓴다 ("처음 한 달은", "그러다 11월이 오면", "12월부터는", "그리고 2월 4일쯤"). 각 문단은 그 달 이름(예: "11월")을 첫 문장 안에 꼭 넣고, 2~3문장, 60~170자:
   - 그 달 기운을 쉬운 말로 ("~래")
   - 이 사람 성향에 그게 어땠는지 미래의 나의 마음으로 ("나한테는 ~했어")
   - 그 달에 할 일 하나 (주어진 "해 볼 것" 중에서, 이 사람의 체크인에 맞게)
   같은 행동을 두 번 권하지 않는다. 끊기는 달 문단은 resume 에서 한 말을 되풀이하지 말고 짧게 한 마디만 ("1월 얘기는 위에서 했지. 하나만 더 하자면 ~").
3. flow — 다음 생일부터 1년: 그 기간의 기운을 쉬운 말로, 단정 대신 "~래", "~것 같아". 이번 기간과 같은 결이면 "이어진다"고 쓴다. 1문단, 120~250자.
4. closing — 편지의 맺음 문단: 부탁 한 가지(날짜나 달이 들어간, 언제·무엇을 하라는지 바로 알 수 있는 평범한 한 문장, 비유·표어 금지)를 하고, 짧은 끝인사로 맺는다 (예: "다음 생일에 또 쓸게."). 2~3문장.

# 근거 규칙 (가장 중요)
- 사주로 계산한 것은 "~래", "~대"로만. 주어진 값 밖의 사주 사실(다른 달, 다른 기운, 재물·연애·건강 운)은 지어내지 않는다.
- 단정해도 되는 것: 본인이 고른 체크인 답과 MBTI 성향.
- 구체적인 사건·생활 장면(휴대폰, 단톡방, 달력, 이불, 설거지, 빨래, 택배, 커피, 산책 같은 것)은 지어내지 않는다.
- 버거운 달을 말할 때는 겁주지 말고 반드시 버티는 법을 같이 준다.
- "가까운 사람"이 누구인지, "좋아하는 것"이 무엇인지 짐작하지 않는다.

# 쓰면 안 되는 것
- 명리 용어(비견, 겁재, 식신, 상관, 편재, 정재, 편관, 정관, 편인, 정인, 일간, 세운, 월운, 오행, 십신, 천을귀인, 충, 합, 원진 등), "MBTI", 네 글자 유형 이름.
- 이직·투자·연애·결혼 결정 지시, 건강 예언과 몸 상태, "반드시", "무조건".
- 직업·학업·가족을 짐작하게 하는 말: 회의, 회사, 출근, 퇴근, 학교, 시험, 엄마, 아빠, 애인, 남편, 아내 등.
- AI 말버릇: 표어 같은 문장, "그게 전부야", "A가 아니었어. 그건 B였어", 셋씩 짝 맞춘 나열, 비유·추상어 잇기, "따끔하게 말할게" 같은 예고, "겁먹지 마", "~했을 거야".
- 생일은 "다음 생일"이라고 쓴다 ("이번 생일" 금지).
- 흔한 상투어: "숨 돌릴 틈", "마음 한쪽", "차곡차곡", "한 걸음씩", "오롯이", "너라서", "선물 같", "쉼표".
- 실제 사람의 입말로, 한 번 읽고 알아듣는 쉬운 말로, 문장은 짧게.`;

function monthBlock(m: MonthGuide, actions: string[], key: boolean): string {
  const lines = [
    `## ${m.month}월${key ? ' (끊기는 달)' : ''} — ${monthHeader(m)}`,
    `- 그 달 기운: ${m.situation} (결: ${m.tone})`,
    ...m.feelings.map((f) => `- ${f.axis} 축에서 이 사람은 ${f.side}: ${f.feeling} — ${f.mind}`),
  ];
  if (m.relationMeaning) lines.push(`- 이 사람과의 관계: ${m.relationMeaning}`);
  if (m.helper) lines.push('- 도와줄 사람이 나타나기 쉬운 달 (누가 될지는 짐작하지 않는다)');
  if (m.newYear) lines.push(`- ${m.start.month}월 ${m.start.day}일 무렵(입춘)부터 사주로 해가 바뀐다. 분위기가 달라지는 때로 한 번 짚는다`);
  lines.push(`- 해 볼 것 (이 중 하나): ${actions.join(' / ')}`);
  return lines.join('\n');
}

export function calendarPagePrompt(ctx: CalendarPageContext, problems: string[] = []): string {
  const parts = [
    `# 편지 유형: ${ctx.type}`,
    `- ${LETTER_TYPE_GUIDE[ctx.type]}`,
    '',
    '# 첫 장 (이미 읽힌 부분, 인사 제외)',
    ctx.firstPage.join('\n\n'),
    '',
    '# 끊긴 문장 (resume 은 이 바로 뒤에 이어지고, 첫 단어가 끊기는 달 이름이다)',
    ctx.cut,
    `- 끊기는 달: ${ctx.keyMonth.month}월`,
    '',
    '# 체크인 (본인이 고른 답, 단정해도 된다)',
    `- 요즘 가장 마음 쓰이는 것: ${ctx.checkin.focus}`,
    `- 요즘 마음 상태: ${ctx.checkin.mood}`,
    `- 다음 생일까지 바라는 것: ${ctx.checkin.wish}`,
    `- 힘들 때 나는: ${ctx.checkin.coping}`,
    `- 요즘 내 시간은: ${ctx.checkin.time}`,
    `# MBTI (본인이 고른 것): ${ctx.mbti}`,
    '',
    `# 이번 ${ctx.span} 전체의 바탕 기운`,
    describe(ctx.current),
    '',
    `# 달력 (${ctx.calendar.length}칸, 이 순서로 calendar 를 쓴다)`,
    ...ctx.calendar.map((m, i) => monthBlock(m, ctx.monthActions[i]!, m === ctx.keyMonth)),
    '',
    `# 다음 생일(${ctx.nextBirthday.month}월 ${ctx.nextBirthday.day}일)부터 1년`,
    describe(ctx.next),
  ];
  if (ctx.sajuVsMbti.length) parts.push('', '# 사주와 성향이 엇갈리는 축 (calendar 나 flow 에 한 줄 넣어도 된다, "사주로 보면 너는 원래 ~쪽이래")', ...ctx.sajuVsMbti.map((x) => `- ${x}`));
  if (problems.length > 0) parts.push('', '# 지난번 결과에서 고칠 점', ...problems.map((p) => `- ${p}`));
  return parts.join('\n');
}

export const CALENDAR_PAGE_SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: '끊긴 문장 바로 뒤, 끊기는 달 이름으로 시작. 2문단' },
    calendar: { type: 'array', items: { type: 'string' }, description: '달 순서대로 달마다 한 문단, 그 달 이름을 첫 문장에 넣고 앞 문단에서 이어지게' },
    flow: { type: 'string', description: '다음 생일부터 1년, 1문단' },
    closing: { type: 'string', description: '날짜나 달이 들어간 부탁 한 문장 + 짧은 끝인사' },
  },
  required: ['resume', 'calendar', 'flow', 'closing'],
  additionalProperties: false,
} as const;

export interface CalendarPage {
  /** 편지 문단 순서대로 (끊긴 달 잇기 → 달마다 → 생일부터 1년 → 맺음) */
  paragraphs: string[];
}

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

export function checkCalendarPage(raw: unknown, ctx: CalendarPageContext): { page: CalendarPage | null; problems: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const strs = ['resume', 'flow', 'closing'] as const;
  const missing = strs.filter((k) => typeof r[k] !== 'string' || !(r[k] as string).trim());
  const cal = Array.isArray(r.calendar) ? (r.calendar as unknown[]).map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '')) : null;
  if (missing.length > 0 || !cal) return { page: null, problems: [`비어 있는 칸이 있어요: ${[...missing, ...(cal ? [] : ['calendar'])].join(', ')}`] };
  const problems: string[] = [];
  const resume = paragraphs(r.resume as string);
  const flow = (r.flow as string).replace(/\s+/g, ' ').trim();
  const closing = (r.closing as string).replace(/\s+/g, ' ').trim();
  const all = [...resume, ...cal, flow, closing].join('\n');

  const words = ruleViolations(all);
  if (words.length > 0) problems.push(`쓰면 안 되는 표현이 들어 있어요: ${words.join(', ')}`);
  if (/MBTI|[EI][NS][TF][JP]/.test(all)) problems.push('"MBTI"나 유형 이름은 쓰지 않아요.');
  if (/천을|귀인|원진|(?<![가-힣])충(?![분전격])|육합|삼합/.test(all)) problems.push('명리 용어(귀인·충·합·원진)는 쓰지 않아요. 쉬운 말로 풀어 주세요.');
  for (const [re, label] of AI_TICS) if (re.test(all)) problems.push(`AI 말버릇이 있어요: ${label}`);

  if (!new RegExp(`^${ctx.keyMonth.month}월`).test(resume[0] ?? '')) problems.push(`resume 은 "${ctx.keyMonth.month}월"로 시작해야 해요 (끊긴 문장 바로 뒤).`);
  if (cal.length !== ctx.calendar.length) problems.push(`calendar 는 ${ctx.calendar.length}칸이어야 해요 (지금 ${cal.length}칸).`);
  const allowed = new Set([...ctx.calendar.map((m) => m.month), ctx.nextBirthday.month]);
  const extra = [...all.matchAll(/(\d{1,2})월/g)].map((m) => Number(m[1])).filter((m) => !allowed.has(m));
  if (extra.length > 0) problems.push(`계산하지 않은 달은 쓰지 않아요: ${[...new Set(extra)].map((m) => `${m}월`).join(', ')}`);
  if (!/\d{1,2}월|\d{1,2}일/.test(closing)) problems.push('closing 의 부탁에 언제인지(달이나 날짜)가 들어가야 해요.');
  cal.forEach((c, i) => {
    const m = ctx.calendar[i];
    if (m && !c.includes(`${m.month}월`)) problems.push(`calendar ${i + 1}번째 문단에 "${m.month}월"이 들어가야 해요.`);
  });
  if (/^\s*[-•·*]|^\d+\./m.test(cal.join('\n'))) problems.push('목록이 아니라 편지 문단으로 써 주세요.');

  const len = (s: string) => s.length;
  const rl = len(resume.join(''));
  if (rl < 150 || rl > 480) problems.push(`resume 길이가 ${rl}자예요 (200~400자).`);
  cal.forEach((c, i) => {
    if (len(c) < 40 || len(c) > 210) problems.push(`calendar ${i + 1}번째 문단 길이가 ${len(c)}자예요 (60~170자).`);
  });
  if (len(flow) < 80 || len(flow) > 300) problems.push(`flow 길이가 ${len(flow)}자예요 (120~250자).`);

  if (problems.length > 0) return { page: null, problems };
  return {
    page: { paragraphs: [...resume, ...cal, flow, closing] },
    problems,
  };
}
