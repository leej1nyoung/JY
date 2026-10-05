// 첫해 두 번째 장 (CLAUDE.md 5-2 "첫해 두 번째 장"). AI 에 넘길 재료와 지시, 결과 검사.
// AI 호출 자체는 웹 서버(apps/web)에서 한다. 여기는 순수 함수만 둔다 (테스트 가능하게).
//
// 원칙
// - AI 에는 계산된 사주 값과 첫 장 문장만 넘긴다. 생년월일·출생지·이름은 넘기지 않는다.
// - 봉투 목차(① 시점, 그날 네가 한 일 ② 다음 생일부터 1년의 흐름 ③ 부탁 한 가지)와 같은 순서·같은 시점으로 쓰게 한다.
// - 주어진 정보 밖의 명리 사실을 지어내지 않게 하고, 결과는 첫 장과 같은 금지어 규칙으로 다시 검사한다.
import {
  THEME_AXES, analyzeSeun, dominantSeun, mbtiFeelings, parseMbti,
  type CivilDate, type Stem, type TenGodGroup,
} from '@naite/saju';
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
  };
}

const date = (c: CivilDate) => `${c.year}년 ${c.month}월 ${c.day}일`;

/** 시스템 지시. 사람마다 바뀌지 않는다 */
export const SECOND_PAGE_SYSTEM = `너는 "나이테"라는 서비스의 편지를 쓴다. "다음 생일의 나"가 "지금의 나"에게 보내는 편지의 두 번째 장이다.
첫 장은 이미 읽혔고, 마지막 문장이 중간에서 끊겼다. 두 번째 장은 그 끊긴 문장 바로 뒤에 이어지는 말로 시작한다.

# 구성 (봉투에 적어 둔 목차와 반드시 같아야 한다)
1. moment — "{시점}, 그날 네가 한 일": 끊긴 문장에 바로 이어 붙여 읽히는 말로 시작한다. 끊긴 부분을 되풀이하지 않는다 (끊긴 문장이 "그날 너는"으로 끝났다면 "그날 너는" 다음에 올 말부터 쓴다). 그 시점에 네가 한 작은 일 하나, 그리고 그게 왜 이 기간 중 가장 고마운 일이었는지를 쓴다.
2. flow — "다음 생일부터 1년의 흐름": 편지를 쓰는 나도 아직 살아 보지 않은 앞으로의 1년이다. 주어진 기운을 바탕으로 어떤 결의 1년이 될 것 같은지 부드럽게 말한다.
3. request — "미래의 내가 꼭 부탁하고 싶은 한 가지": 한 문장.

# 말투
- 반말. 미래의 나는 이미 겪은 사람이므로 지나간 기간은 기억하는 말투로 쓴다 ("~했어", "~더라", "~던 거 같아"). 남의 일을 짐작하는 "~했을 거야"는 쓰지 않는다.
- 앞으로의 1년(flow)은 단정하지 않는다 ("~할 것 같아", "~한 해래"). 예언처럼 말하지 않는다.
- 첫 장과 같은 사람이 쓴 것처럼 이어지게 한다. 첫 장에 이미 쓴 장면·문장은 되풀이하지 않는다.
- 짧고 구체적으로. 꾸민 비유를 늘어놓지 않는다. 마무리를 칭찬 공식으로 닫지 않는다.

# 내용 규칙
- "그날 네가 한 일"은 누구에게나 있을 법한 작고 무해한 행동 하나로 쓴다 (예: 하던 걸 멈추고 일찍 잔 것, 미뤄 둔 연락을 먼저 한 것, "그건 안 돼"라고 말한 것, 혼자 오래 걸은 것). 그 사람의 구체적인 사생활을 지어내지 않는다: 직업·학교·가족·연인·건강·돈 액수·장소 이름은 쓰지 않는다.
- 장면은 누구에게나 있는 것(휴대폰, 단톡방, 버스, 이불, 밥, 날씨)에서만 가져온다.
- MBTI는 성격 설명이 아니라 행동 하나로 보여 준다. 버거웠던 쪽은 평소엔 안 하던 행동으로, 편했던 쪽은 장면 하나로.
- 주어진 정보 밖의 사주 사실(오행, 대운, 궁합, 길흉, 특정 날짜의 운 등)을 만들어 내지 않는다. 명리 용어(비견, 겁재, 식신, 상관, 편재, 정재, 편관, 정관, 편인, 정인, 일간, 세운, 오행, 십신, 월운 등)와 "사주", "MBTI", 네 글자 유형 이름(INFP 등)은 본문에 쓰지 않는다.
- 쓰지 않는다: 이직·투자·연애·결혼 결정 지시, 건강 예언, 단정적 예언, "반드시", "무조건".
- 쓰지 않는다: 회의, 회사, 출근, 퇴근, 학교, 시험, 과제, 엄마, 아빠, 애인처럼 직업·학업·가족을 짐작하게 하는 말.
- 쓰지 않는다: "너라서", "많이 애썼", "단단해졌", "오롯이", "차곡차곡", "한 걸음씩", "선물 같", "숨 돌릴 틈", "마음 한쪽", "쉼표".
- 이름을 부르지 않는다. 필요하면 "너"라고 한다.

# 길이와 형식
- moment: 2~4문단, 350~650자. flow: 2~3문단, 250~450자. request: 한 문장, 60자 이내.
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
    moment: { type: 'string', description: '① 시점, 그날 네가 한 일. 끊긴 문장 바로 뒤에 이어지는 말로 시작' },
    flow: { type: 'string', description: '② 다음 생일부터 1년의 흐름' },
    request: { type: 'string', description: '③ 미래의 내가 부탁하는 한 가지, 한 문장' },
  },
  required: ['moment', 'flow', 'request'],
  additionalProperties: false,
} as const;

export interface SecondPage {
  moment: string[];
  flow: string[];
  request: string;
}

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
const chars = (ps: string[]) => ps.join('').length;

/** AI 결과를 검사한다. 문제가 없으면 problems 가 빈 배열 */
export function checkSecondPage(raw: unknown, ctx: SecondPageContext): { page: SecondPage | null; problems: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.moment !== 'string' || typeof r.flow !== 'string' || typeof r.request !== 'string') {
    return { page: null, problems: ['moment, flow, request 세 칸을 모두 문자열로 채워 주세요.'] };
  }
  const page: SecondPage = { moment: paragraphs(r.moment), flow: paragraphs(r.flow), request: r.request.replace(/\s+/g, ' ').trim() };
  const problems: string[] = [];
  const all = [...page.moment, ...page.flow, page.request].join('\n');

  const words = ruleViolations(all);
  if (words.length > 0) problems.push(`쓰면 안 되는 표현이 들어 있어요: ${words.join(', ')}`);
  if (/사주|MBTI|[EI][NS][TF][JP]/.test(all)) problems.push('"사주", "MBTI", 유형 이름은 본문에 쓰지 않아요.');

  const m = chars(page.moment);
  const f = chars(page.flow);
  if (m < 250 || m > 900) problems.push(`moment 길이가 ${m}자예요. 350~650자로 맞춰 주세요.`);
  if (f < 180 || f > 700) problems.push(`flow 길이가 ${f}자예요. 250~450자로 맞춰 주세요.`);
  if (page.request.length < 8 || page.request.length > 90) problems.push(`request 길이가 ${page.request.length}자예요. 60자 이내 한 문장으로.`);

  // 끊긴 문장 끝("그날 너는")을 되풀이하며 시작하지 않는다
  const tail = ctx.cut.split(/[.?!]\s*/).at(-1)!.trim().split(' ').slice(-2).join(' ');
  if (tail && page.moment[0]?.startsWith(tail)) problems.push(`moment 가 끊긴 문장의 "${tail}"을 되풀이하며 시작해요. 그다음 말부터 써 주세요.`);

  return { page, problems };
}
