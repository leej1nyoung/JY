// 첫해 두 번째 장 (CLAUDE.md 5-2 "첫해 두 번째 장"). AI 에 넘길 재료와 지시, 결과 검사.
// AI 호출 자체는 웹 서버(apps/web)에서 한다. 여기는 순수 함수만 둔다 (테스트 가능하게).
//
// 원칙
// - AI 에는 계산된 사주 값과 첫 장 문장만 넘긴다. 생년월일·출생지·이름은 넘기지 않는다.
// - 봉투 목차(① 시점, 그날 네가 한 일 ② 다음 생일부터 1년의 흐름 ③ 부탁 한 가지)와 같은 순서·같은 시점으로 쓰게 한다.
// - 주어진 정보 밖의 명리 사실을 지어내지 않게 하고, 결과는 첫 장과 같은 금지어 규칙으로 다시 검사한다.
import {
  analyzeSeun, dominantSeun, mbtiFeelings, parseMbti,
  type Branch, type CivilDate, type Stem, type TenGodGroup,
} from '@naite/saju';
import { isClash, isCombine, monthBranches } from './anchor.ts';
import { addMonths, birthdayInYear, birthdayKeyOf, type BirthdayBasis } from './cycle.ts';
import type { FirstLetter } from './compose.ts';
import { ruleViolations } from './rules.ts';

/** 세운 기운별 그 시기의 상황 (CLAUDE.md 5-2 표) */
const THEME_SITUATION: Readonly<Record<TenGodGroup, string>> = {
  비겁: '사람이 몰리고 경쟁하는 시기. 내 힘으로 버티고 내 몫을 지켜야 하는 시간',
  식상: '표현하고 만들어내는 시기. 말과 결과물이 늘고, 기존 틀에서 벗어나고 싶어지는 시간',
  재성: '현실과 성과를 챙기는 시기. 돈, 일의 결과, 관리할 것이 많아지는 시간',
  관성: '책임과 평가의 시기. 맡은 자리, 규칙, 누군가의 시선이 무거워지는 시간',
  인성: '배우고 생각하고 도움받는 시기. 속도가 느려지고 안을 들여다보게 되는 시간',
};

/** 테마별 축 글자의 마음 (CLAUDE.md 5-2 표의 편했을 쪽 / 버거웠을 쪽) */
const SIDE_FEELING: Readonly<Record<TenGodGroup, Readonly<Record<string, string>>>> = {
  비겁: { E: '사람 속에서 힘을 얻음', I: '사람에 치여 혼자 있을 시간이 모자람', T: '경쟁을 경쟁으로 받아들임', F: '내 몫을 챙기다 관계가 상할까 마음 씀' },
  식상: { E: '드러내는 게 신남', I: '계속 보여줘야 해서 지침', P: '틀 밖이 자연스러움', J: '정해진 게 흔들려 불안함' },
  재성: { S: '구체적인 숫자와 결과가 편함', N: '의미보다 숫자를 좇느라 공허함', J: '계획하고 관리하는 게 맞음', P: '챙길 게 많아 숨 막힘' },
  관성: { J: '틀이 있어 오히려 안정됨', P: '틀에 맞추느라 답답함', T: '평가를 평가로 받아들임', F: '한마디가 오래 마음에 남음' },
  인성: { N: '생각할 시간이 반가움', S: '손에 잡히는 게 없어 답답함', I: '혼자의 시간이 충전이 됨', E: '조용한 시간이 길게 느껴짐' },
};

const MOMENT_MEANING = {
  clash: '마음이 가장 흔들렸던 달',
  combine: '마음이 가장 놓였던 달',
  ipchun: '해가 바뀌는 입춘 무렵',
  none: '특별한 날 없이 지나간 어느 평범한 날',
} as const;

/**
 * 다음 생일까지 꼭 알아 둘 달. 기간 안 월운(절입 기준 달)의 월지와 일지(日支)의 관계로 계산한다 (첫 장의 시점과 같은 원리).
 * - 충(沖): 마음이 흔들리기 쉬운 달 → 큰 결정은 한 박자 늦추고, 몸과 마음을 먼저 챙기기
 * - 합(合): 일이 잘 맞물리는 달 → 미뤄 둔 걸 시작하거나 사람을 만나기 좋은 때
 * "흔들림/잘 풀림"으로 읽는 것은 이 서비스의 해석이다.
 */
export interface KeyMonths {
  shaky: number[];
  smooth: number[];
}

export function keyMonths(dayBranch: Branch, from: CivilDate, to: CivilDate): KeyMonths {
  const months = monthBranches(from, to);
  const uniq = (xs: number[]) => [...new Set(xs)];
  return {
    shaky: uniq(months.filter((m) => isClash(m.branch, dayBranch)).map((m) => m.month)),
    smooth: uniq(months.filter((m) => isCombine(m.branch, dayBranch)).map((m) => m.month)),
  };
}

/** 테마별 그 기간에 잘하고 있는 것으로 짚을 만한 방향 (편했던 축이 없을 때 쓴다) */
const THEME_STRENGTH: Readonly<Record<TenGodGroup, string>> = {
  비겁: '사람들 사이에서도 내 몫을 놓지 않고 버틴 것',
  식상: '하고 싶은 말과 만든 것을 결국 밖으로 꺼낸 것',
  재성: '챙길 게 많아도 큰 구멍 없이 하나씩 처리한 것',
  관성: '압박이 와도 맡은 걸 끝까지 내려놓지 않은 것',
  인성: '느려도 생각을 멈추지 않고 하나를 붙잡은 것',
};

/** 테마별 다음 생일까지의 마음가짐 재료 (AI 가 이 방향으로 한 문장을 쓴다) */
const THEME_MINDSET: Readonly<Record<TenGodGroup, string>> = {
  비겁: '남과 비교하는 대신 내 몫 하나를 분명히 하기',
  식상: '다 보여 주려 하지 말고 하나를 끝까지 내놓기',
  재성: '챙길 것의 순서를 정하고, 나를 위한 몫도 그 목록에 넣기',
  관성: '남의 기준보다 내가 지킬 수 있는 속도를 먼저 정하기',
  인성: '생각을 오래 붙잡되, 작은 것 하나는 손으로 해 보기',
};

export interface PeriodReading {
  from: CivilDate;
  to: CivilDate;
  /** 정/편 톤 */
  tone: string;
  situation: string;
  /** 세운 지지가 다른 기운일 때 곁들이는 상황 (없으면 null) */
  aside: string | null;
  feelings: { axis: string; side: string; feeling: '편함' | '버거움'; mind: string }[];
  combination: string;
}

export interface SecondPageContext {
  /** 지금부터 다음 생일까지의 길이 ("다섯 달", "1년") */
  span: string;
  current: PeriodReading;
  next: PeriodReading;
  moment: { label: string; when: string; meaning: string };
  /** 첫 장 본문 (인사 제외, 첫마디~끊긴 문장) */
  firstPage: string[];
  cut: string;
  /** 다음 생일까지 꼭 알아 둘 달 (코드가 계산) */
  months: KeyMonths;
  /** 잘하고 있는 것 방향 (편했던 축이 없을 때) */
  strength: string;
  /** 다음 생일까지의 마음가짐 방향 */
  mindset: string;
}

const cmp = (a: CivilDate, b: CivilDate) => a.year - b.year || a.month - b.month || a.day - b.day;

function reading(dayMaster: Stem, mbti: string, from: CivilDate, to: CivilDate): PeriodReading {
  const seun = analyzeSeun(dayMaster, dominantSeun(from, to).pillar);
  const { axes, combination } = mbtiFeelings(seun.theme, mbti);
  return {
    from,
    to,
    tone: seun.tone,
    situation: THEME_SITUATION[seun.theme],
    aside: seun.needsSubSentence ? THEME_SITUATION[seun.branchGroup] : null,
    feelings: axes.map((a) => ({ ...a, mind: SIDE_FEELING[seun.theme][a.side]! })),
    combination,
  };
}

/** 다음 생일 다음의 생일 (② "다음 생일부터 1년"의 끝) */
export function followingBirthday(solarBirth: CivilDate, basis: BirthdayBasis, nextBirthday: CivilDate): CivilDate {
  const key = birthdayKeyOf(solarBirth, basis);
  for (const y of [nextBirthday.year + 1, nextBirthday.year + 2]) {
    const d = birthdayInYear(key, y);
    if (d && cmp(d, nextBirthday) > 0) return d;
  }
  return addMonths(nextBirthday, 12); // 음력 데이터 범위 밖: 1년 뒤로 근사
}

export function buildSecondPageContext(input: {
  dayMaster: Stem;
  dayBranch: Branch;
  mbti: string;
  letter: FirstLetter;
  nextBirthday: CivilDate;
  followingBirthday: CivilDate;
  span: string;
}): SecondPageContext {
  const mbti = parseMbti(input.mbti);
  const { letter } = input;
  const kind = letter.moment.anchor.kind;
  return {
    span: input.span,
    current: reading(input.dayMaster, mbti, letter.meta.period.from, input.nextBirthday),
    next: reading(input.dayMaster, mbti, input.nextBirthday, input.followingBirthday),
    moment: { label: letter.moment.label, when: letter.moment.when, meaning: MOMENT_MEANING[kind] },
    firstPage: letter.paragraphs,
    cut: letter.cut,
    months: keyMonths(input.dayBranch, letter.meta.period.from, input.nextBirthday),
    strength: THEME_STRENGTH[letter.meta.seun.theme],
    mindset: THEME_MINDSET[letter.meta.seun.theme],
  };
}

const date = (c: CivilDate) => `${c.year}년 ${c.month}월 ${c.day}일`;

/** 시스템 지시. 사람마다 바뀌지 않는다 */
export const SECOND_PAGE_SYSTEM = `너는 "나이테"라는 서비스의 편지를 쓴다. "다음 생일의 나"가 "지금의 나"에게 보내는 편지의 두 번째 장이다.
읽는 사람은 이 두 번째 장을 열려고 돈을 냈다. 첫 줄부터 "열어 보길 잘했다"는 느낌이 들어야 하고, 한 번 읽고 바로 이해돼야 한다.

# 구성 (편지 안에서 이 순서로 이어진다. 봉투에 적어 둔 목차와 같아야 한다)
0. headline — 두 번째 장 맨 위에 크게 놓이는 한 줄. 이 편지가 하고 싶은 말을 가장 쉽고 분명하게. 30자 이내. 따뜻하지만 흐릿하지 않게.
   좋은 예: "그 다섯 달을 버티게 한 건, 11월의 그 저녁이었어." / 나쁜 예: "끝낸 게 없는 날에도, 남은 한 줄은 꼭 적어 줘." (무슨 뜻인지 바로 안 들어온다)
1. moment — "{시점}, 그날 네가 한 일": 첫 장의 끊긴 문장 바로 뒤에 이어 붙여 읽히는 말로 시작한다. 끊긴 부분은 되풀이하지 않는다 (끊긴 문장이 "그날 너는"으로 끝났다면 그다음 말부터). 첫 문장은 짧고 구체적으로, 그날 한 행동을 바로 말한다. 그다음 그게 왜 이 기간 중 가장 고마웠는지를 쉬운 말로.
2. guide — "다음 생일까지 꼭 알아 둘 것": 편지 문장으로 이어 쓴다 (목록·제목 없이). 읽고 나서 "이건 도움이 된다"고 바로 느껴지게, 세 가지를 쉬운 말로 담는다.
   (가) 지금 잘하고 있는 것 하나: 주어진 재료에서 고르고, 행동으로 짚어 준다. 칭찬은 구체적으로.
   (나) 꼭 알아 둘 달: 주어진 달만 쓴다. 흔들리기 쉬운 달에는 무엇을 조심하면 좋은지(큰 결정은 한 박자 늦게, 잠과 밥 먼저 챙기기 같은 생활의 행동), 잘 풀리는 달에는 무엇을 해 보면 좋은지 구체적으로. 주어진 달이 없으면 달 얘기는 하지 않는다.
   (다) 다음 생일까지 가지면 좋은 마음가짐 한 가지: 주어진 방향을 이 사람 상황에 맞게.
   전해 들은 말투("~래", "~대")와 기억하는 말투를 섞어 자연스럽게. 2문단 정도.
3. flow — "다음 생일부터 1년의 흐름": 편지를 쓰는 나도 아직 살아 보지 않은 앞으로의 1년이다. 어떤 1년이 될 것 같은지, 그때 무엇을 조심하고 무엇을 즐기면 좋은지 구체적으로.
4. request — "미래의 내가 꼭 부탁하고 싶은 한 가지": 한 문장. 언제, 무엇을 하라는 건지 한 번에 알 수 있게 구체적인 행동으로 (예: "11월 중 하루는 약속 없이 일찍 들어와서 푹 자 줘."). 비유나 수수께끼처럼 쓰지 않는다.

# 쉽게 쓰기
- 중학생이 한 번 읽고 바로 이해할 수 있는 말로 쓴다. 한 문장에 한 가지 생각만. 문장은 짧게.
- 추상적인 말("남은 걸 세는 법", "내 속도로 걷기", "조용함이 허전하지 않았다")을 이어 붙이지 않는다. 무엇을 했는지, 무엇이 달라졌는지를 그대로 말한다.
- 비유는 쓰지 않는다.

# 말투
- 반말. 지나간 기간은 이미 겪은 사람의 기억하는 말투 ("~했어", "~더라", "~던 거 같아"). 남의 일을 짐작하는 "~했을 거야"는 쓰지 않는다.
- 앞으로의 1년(flow)은 단정하지 않는다 ("~할 것 같아", "~한 해래"). 예언처럼 말하지 않는다.
- 첫 장과 같은 사람이 쓴 것처럼 이어지게 한다. 첫 장에 이미 쓴 장면은 되풀이하지 않는다.

# 내용 규칙
- "그날 네가 한 일"은 누구에게나 있을 법한 작고 무해한 행동 하나 (예: 하던 걸 멈추고 일찍 잔 것, 미뤄 둔 연락을 먼저 한 것, "그건 안 돼"라고 말한 것, 혼자 오래 걸은 것). 그 사람의 구체적인 사생활을 지어내지 않는다: 직업·학교·가족·연인·건강·돈 액수·장소 이름은 쓰지 않는다.
- 장면은 누구에게나 있는 것(휴대폰, 단톡방, 버스, 이불, 밥, 날씨)에서만 가져온다.
- 성격을 설명하지 않는다 ("너는 원래 ~한 사람이잖아" 금지). MBTI 성향은 행동 하나로만 보여 준다.
- 주어진 정보 밖의 사주 사실(오행, 대운, 궁합, 길흉, 특정 날짜의 운 등)을 만들어 내지 않는다. 명리 용어(비견, 겁재, 식신, 상관, 편재, 정재, 편관, 정관, 편인, 정인, 일간, 세운, 오행, 십신, 월운 등)와 "사주", "MBTI", 네 글자 유형 이름(INFP 등)은 쓰지 않는다.
- 쓰지 않는다: 이직·투자·연애·결혼 결정 지시, 건강 예언, 단정적 예언, "반드시", "무조건".
- 쓰지 않는다: 회의, 회사, 출근, 퇴근, 학교, 시험, 과제, 엄마, 아빠, 애인처럼 직업·학업·가족을 짐작하게 하는 말.
- 쓰지 않는다: "너라서", "많이 애썼", "단단해졌", "오롯이", "차곡차곡", "한 걸음씩", "선물 같", "숨 돌릴 틈", "마음 한쪽", "쉼표".
- 이름을 부르지 않는다. 필요하면 "너"라고 한다.

# 길이와 형식
- headline 30자 이내. moment 2~3문단, 300~550자. guide 2문단 정도, 200~400자. flow 2~3문단, 250~450자. request 한 문장, 60자 이내.
- 문단은 빈 줄로 나눈다. 제목·번호·따옴표 장식은 붙이지 않는다.`;

function describe(p: PeriodReading): string {
  const lines = [
    `- 기간: ${date(p.from)} ~ ${date(p.to)}`,
    `- 그 시기의 상황: ${p.situation}`,
    `- 결(세기): ${p.tone}`,
  ];
  if (p.aside) lines.push(`- 곁들여 있는 기운 (한 줄 정도만): ${p.aside}`);
  for (const f of p.feelings) lines.push(`- ${f.axis} 축에서 이 사람은 ${f.side}: ${f.feeling} — ${f.mind}`);
  lines.push(`- 두 축의 조합: ${p.combination}`);
  return lines.join('\n');
}

/** 사람마다 다른 재료 */
export function secondPagePrompt(ctx: SecondPageContext, problems: string[] = []): string {
  const parts = [
    '# 첫 장 (이미 읽힌 부분, 인사 제외)',
    ctx.firstPage.join('\n\n'),
    '',
    '# 끊긴 문장 (두 번째 장은 이 문장 바로 뒤에 이어진다)',
    ctx.cut,
    '',
    `# 봉투 목차의 시점: ${ctx.moment.label}`,
    `- 첫 장이 짚은 표현: "${ctx.moment.when}"`,
    `- 이 시점의 의미: ${ctx.moment.meaning}`,
    '',
    `# 지금부터 다음 생일까지 (이번 ${ctx.span}, 이미 지나간 기간으로 기억하며 쓴다)`,
    describe(ctx.current),
    '',
    '# 다음 생일부터 1년 (flow 에서 앞으로의 흐름으로 쓴다)',
    describe(ctx.next),
    '',
    '# 다음 생일까지 꼭 알아 둘 것 (guide)',
    `- 잘하고 있는 것: 위 "지금부터 다음 생일까지"에서 "편함"인 축이 있으면 그 행동을, 없으면 이것을 짚는다 → ${ctx.strength}`,
    `- 흔들리기 쉬운 달: ${ctx.months.shaky.length ? ctx.months.shaky.map((m) => `${m}월`).join(', ') : '없음 (달 얘기를 하지 않는다)'}`,
    `- 잘 풀리는 달: ${ctx.months.smooth.length ? ctx.months.smooth.map((m) => `${m}월`).join(', ') : '없음 (달 얘기를 하지 않는다)'}`,
    `- 마음가짐 방향: ${ctx.mindset}`,
  ];
  if (problems.length > 0) {
    parts.push('', '# 지난번 결과에서 고칠 점', ...problems.map((p) => `- ${p}`));
  }
  return parts.join('\n');
}

/** 구조화 출력 스키마 */
export const SECOND_PAGE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: '두 번째 장 맨 위 한 줄, 30자 이내' },
    moment: { type: 'string', description: '① 시점, 그날 네가 한 일. 끊긴 문장 바로 뒤에 이어지는 말로 시작' },
    flow: { type: 'string', description: '② 다음 생일부터 1년의 흐름' },
    guide: { type: 'string', description: '다음 생일까지 꼭 알아 둘 것(잘하고 있는 것, 알아 둘 달, 마음가짐), 편지 문장 2문단 정도' },
    request: { type: 'string', description: '미래의 내가 부탁하는 한 가지, 구체적인 행동 한 문장' },
  },
  required: ['headline', 'moment', 'guide', 'flow', 'request'],
  additionalProperties: false,
} as const;

export interface SecondPage {
  headline: string;
  moment: string[];
  /** 다음 생일까지 꼭 알아 둘 것 (편지 문장) */
  guide: string[];
  flow: string[];
  request: string;
}

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
const chars = (ps: string[]) => ps.join('').length;

/** AI 결과를 검사한다. 문제가 없으면 problems 가 빈 배열 */
const line = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function checkSecondPage(raw: unknown, ctx: SecondPageContext): { page: SecondPage | null; problems: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fields = ['headline', 'moment', 'guide', 'flow', 'request'] as const;
  const missing = fields.filter((k) => typeof r[k] !== 'string' || !(r[k] as string).trim());
  if (missing.length > 0) return { page: null, problems: [`비어 있는 칸이 있어요: ${missing.join(', ')}`] };

  const page: SecondPage = {
    headline: line(r.headline),
    moment: paragraphs(r.moment as string),
    guide: paragraphs(r.guide as string),
    flow: paragraphs(r.flow as string),
    request: line(r.request),
  };
  const problems: string[] = [];
  const all = [page.headline, ...page.moment, ...page.guide, ...page.flow, page.request].join('\n');

  const words = ruleViolations(all);
  if (words.length > 0) problems.push(`쓰면 안 되는 표현이 들어 있어요: ${words.join(', ')}`);
  if (/사주|MBTI|[EI][NS][TF][JP]/.test(all)) problems.push('"사주", "MBTI", 유형 이름은 쓰지 않아요.');
  if (/원래[^.?!]{0,25}사람이잖아/.test(all)) problems.push('"너는 원래 ~한 사람이잖아"처럼 성격을 설명하지 말고 행동으로 보여 주세요.');

  const m = chars(page.moment);
  const g = chars(page.guide);
  const f = chars(page.flow);
  if (page.headline.length < 8 || page.headline.length > 40) problems.push(`headline 이 ${page.headline.length}자예요. 30자 이내 한 줄로.`);
  if (m < 220 || m > 750) problems.push(`moment 길이가 ${m}자예요. 300~550자로 맞춰 주세요.`);
  if (g < 150 || g > 550) problems.push(`guide 길이가 ${g}자예요. 200~400자로 맞춰 주세요.`);
  if (f < 180 || f > 650) problems.push(`flow 길이가 ${f}자예요. 250~450자로 맞춰 주세요.`);
  if (page.request.length < 8 || page.request.length > 90) problems.push(`request 가 ${page.request.length}자예요. 60자 이내 한 문장으로.`);

  // 알아 둘 달은 계산된 달만, 계산된 달은 빠짐없이 (지어낸 달이 없게)
  const guideText = page.guide.join(' ');
  const given = [...ctx.months.shaky, ...ctx.months.smooth];
  const missingMonths = given.filter((m) => !new RegExp(`(^|[^0-9])${m}월`).test(guideText));
  if (missingMonths.length > 0) problems.push(`guide 에 알아 둘 달(${missingMonths.map((m) => `${m}월`).join(', ')})을 넣어 주세요.`);
  const extraMonths = [...guideText.matchAll(/(\d{1,2})월/g)].map((x) => Number(x[1])).filter((m) => !given.includes(m));
  if (extraMonths.length > 0) problems.push(`guide 에 주어지지 않은 달(${[...new Set(extraMonths)].map((m) => `${m}월`).join(', ')})이 있어요. 주어진 달만 써 주세요.`);

  // 끊긴 문장 끝("그날 너는")을 되풀이하며 시작하지 않는다
  const tail = ctx.cut.split(/[.?!]\s*/).at(-1)!.trim().split(' ').slice(-2).join(' ');
  if (tail && page.moment[0]?.startsWith(tail)) problems.push(`moment 가 끊긴 문장의 "${tail}"을 되풀이하며 시작해요. 그다음 말부터 써 주세요.`);

  return { page, problems };
}
