// 첫해 첫 장 AI 생성 (CLAUDE.md 5-2 "첫해 첫 장"). 재료·지시·결과 검사. AI 호출은 웹 서버에서 한다.
//
// - 위로가 아니라 "미래의 내가 주는 공략집". 지금의 나를 먼저 알아봐 주고, 그다음 미래.
// - 단정 규칙: 체크인·MBTI(본인이 말한 것)만 단정, 사주는 "~래", 앞으로의 일은 사주 흐름 + 그때의 내 마음으로만 (구체적 사건·생활 장면은 지어내지 않는다).
// - AI 에는 계산된 사주 값과 체크인만 넘긴다. 생년월일·출생지·이름은 넘기지 않는다 (인사는 코드가 붙인다).
import {
  calculateSaju, compareWithMbti, ipchunUtc, koreaCivilToUtc, parseMbti, sajuAxisScores,
  type Branch, type CivilDate, type Stem,
} from '@naite/saju';
import { pickBySeed, THEME_ACTIONS } from './scenes.ts';
import { keyMonthOf, monthlyGuide, type MonthGuide } from './monthly.ts';
import { spanWord, vocative } from './compose.ts';
import { createFirstLetter, type FirstLetterField, type FirstLetterRequest, type LetterStamp } from './first-letter.ts';
import { describe, keyMonths, followingBirthday, reading, type KeyMonths, type PeriodReading } from './second-page.ts';
import { LETTER_TYPE_GUIDE, letterType, type Checkin, type LetterType } from './checkin.ts';
import { ruleViolations } from './rules.ts';

/** 일간 10가지 결 (명리에서 흔히 쓰는 일간 물상. "사주로 보면 ~래"로만 쓴다) */
export const DAY_MASTER_NATURE: Readonly<Record<Stem, { image: string; outer: string }>> = {
  甲: { image: '곧게 자라는 큰 나무', outer: '곧고 원칙이 분명하고, 앞장서는 쪽' },
  乙: { image: '어디서든 뻗어 가는 덩굴과 풀꽃', outer: '유연하고 어디서든 자리를 잡는 쪽' },
  丙: { image: '하늘의 해', outer: '밝고 드러나고, 있으면 분위기가 사는 쪽' },
  丁: { image: '조용히 오래 타는 촛불', outer: '섬세하고 조용히 곁을 비추는 쪽' },
  戊: { image: '묵직한 산', outer: '잘 흔들리지 않고 믿음직한 쪽' },
  己: { image: '씨앗을 품어 기르는 밭', outer: '품어 주고 챙기고, 실속 있는 쪽' },
  庚: { image: '단단한 쇠', outer: '한번 정하면 끝까지 가는, 단단한 쪽' },
  辛: { image: '다듬어진 보석', outer: '섬세하고 깔끔하고, 자기 기준이 높은 쪽' },
  壬: { image: '넓게 흐르는 큰물', outer: '넓게 받아 주고 생각이 깊은 쪽' },
  癸: { image: '조용히 스며드는 빗물', outer: '조용히 스며들고 눈치가 빠른 쪽' },
};

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export interface FirstPageContext {
  readAt: { month: number; day: number; weekday: string };
  /** 지금부터 다음 생일까지 ("넉 달", "1년") */
  span: string;
  nextBirthday: CivilDate;
  nature: { image: string; outer: string };
  mbti: string;
  /** 원국 축 점수와 실제 MBTI 가 엇갈리는 축 (두 번째 장 재료, 첫 장에서는 쓰지 않는다) */
  sajuVsMbti: string[];
  checkin: Checkin;
  type: LetterType;
  current: PeriodReading;
  next: PeriodReading;
  months: KeyMonths;
  /** 월별 공략 달력 (두 번째 장의 중심) */
  calendar: MonthGuide[];
  /** 첫 장이 끊기는 달 (두 번째 장 첫 줄에서 밝힌다) */
  keyMonth: MonthGuide | null;
  /** 기간 안에 입춘(세운이 바뀌는 때)이 있으면 true */
  ipchunInPeriod: boolean;
  /** 내가 그 시기에 해 보고 효과 있었던 행동 후보 (주 테마별) */
  actions: string[];
  /** 봉투에 보일 두 번째 장 목차 4줄 */
  toc: [string, string, string, string];
}

/** 봉투 목차. 첫 줄의 달 이름은 두 번째 장에서 밝히므로 여기서는 숨긴다 */
export function tocFor(type: LetterType, span: string, calendar: MonthGuide[], nextBirthday: CivilDate): FirstPageContext['toc'] {
  const first: Record<LetterType, string> = {
    '미리 알려 줄게': `이 ${span} 중 제일 조심할 달과 피하는 법`,
    '이것만은 지켜': `이 ${span} 중 제일 조심할 달과 버티는 법`,
    '이번엔 잡아': `이 ${span} 중 놓치면 아까운 달`,
    '방향을 고를 때': `이 ${span} 중 서두르면 안 되는 달`,
  };
  const first0 = calendar[0], last = calendar.at(-1);
  const second = first0 && last && calendar.length > 1
    ? `달마다 공략: ${first0.month}월부터 ${last.start.year > first0.start.year ? '내년 ' : ''}${last.month}월까지`
    : '다음 생일까지 꼭 알아 둘 것';
  return [first[type], second, `${nextBirthday.month}월 ${nextBirthday.day}일 생일부터 1년의 흐름`, '미래의 내가 꼭 부탁하고 싶은 한 가지'];
}

function ipchunBetween(from: CivilDate, to: CivilDate): boolean {
  const start = koreaCivilToUtc({ ...from, hour: 0, minute: 0 }).utcMs;
  const end = koreaCivilToUtc({ ...to, hour: 0, minute: 0 }).utcMs;
  for (let y = from.year; y <= to.year; y++) {
    const ip = ipchunUtc(y);
    if (ip > start && ip < end) return true;
  }
  return false;
}

export type FirstPageContextResult =
  | { ok: true; context: FirstPageContext; greeting: string; stamp: LetterStamp; nextBirthday: CivilDate; notes: string[] }
  | { ok: false; field: FirstLetterField; message: string };

export function createFirstPageContext(req: FirstLetterRequest, checkin: Checkin, createdAt: Date): FirstPageContextResult {
  const first = createFirstLetter(req, createdAt);
  if (!first.ok) return first;
  const saju = calculateSaju({
    calendar: req.calendar, year: req.year, month: req.month, day: req.day,
    isLeapMonth: req.calendar === 'lunar' ? req.isLeapMonth : false, time: req.time, birthplaceCode: req.birthplaceCode,
  });
  const chart = saju.status === 'ok' ? saju.chart : saju.candidates.before;
  const dayMaster = chart.dayMaster;
  const dayBranch = chart.pillars.day.branch as Branch;
  const mbti = parseMbti(req.mbti);
  const from = first.letter.meta.period.from;
  const next = first.nextBirthday;
  const [y, m, d] = first.stamp.birthDate.split('-').map(Number) as [number, number, number];
  const following = followingBirthday({ year: y, month: m, day: d }, req.birthdayBasis, next);
  const current = reading(dayMaster, mbti, from, next);
  const span = spanWord(from, next);
  const months = keyMonths(dayBranch, from, next);
  const calendar = monthlyGuide(dayMaster, dayBranch, mbti, from, next);
  const type = letterType(current.combination as Parameters<typeof letterType>[0], checkin);

  const sajuVsMbti = compareWithMbti(sajuAxisScores(chart), mbti)
    .filter((a) => a.match === '불일치' && a.strength !== '균형')
    .map((a) => `${a.axis}: 사주로 보면 ${a.strength === '뚜렷' ? '뚜렷하게' : '약간'} ${a.direction} 쪽인데, 실제는 ${a.actual}`);

  const seed = `${req.year}-${req.month}-${req.day}|${mbti}|${checkin.focus}|${checkin.mood}|${checkin.wish}`;
  const kst = new Date(createdAt.getTime() + 9 * 3600_000);
  const context: FirstPageContext = {
    readAt: { month: kst.getUTCMonth() + 1, day: kst.getUTCDate(), weekday: WEEKDAYS[kst.getUTCDay()]! },
    span,
    nextBirthday: next,
    nature: DAY_MASTER_NATURE[dayMaster],
    mbti,
    sajuVsMbti,
    checkin,
    type,
    current,
    next: reading(dayMaster, mbti, next, following),
    months,
    ipchunInPeriod: ipchunBetween(from, next),
    calendar,
    keyMonth: keyMonthOf(calendar, type === '이번엔 잡아'),
    toc: tocFor(type, span, calendar, next),
    actions: pickBySeed(THEME_ACTIONS[current.theme], seed, 2),
  };
  const greeting = req.name?.trim() ? `${vocative(req.name.trim())}, 생일 축하해. 다음 생일의 나야.` : '생일 축하해. 다음 생일의 나야.';
  return { ok: true, context, greeting, stamp: first.stamp, nextBirthday: next, notes: first.notes };
}

/** 시스템 지시. 사람마다 바뀌지 않는다 */
export const FIRST_PAGE_SYSTEM = `너는 "나이테"라는 서비스의 편지를 쓴다. "다음 생일의 나"가 "지금의 나"에게 보내는 편지의 첫 장이다 (인사말은 이미 붙어 있다. 그다음부터 쓴다).
이 편지는 위로하는 편지가 아니라 "미래의 내가 먼저 겪어 보고 알려 주는 공략집"이다. 따뜻하지만 솔직한 친구의 반말로 쓴다.
첫 장은 무료이고, 두 번째 장은 돈을 내야 열린다. 첫 장의 일은 두 가지다: 읽는 사람이 "이거 내 얘기다" 하게 만들고, 가장 중요한 말 직전에서 끊어 두 번째 장을 열고 싶게 만드는 것.

# 칸 (이 순서로 이어 읽힌다)
1. now — 편지를 여는 지금: 날짜와 요일, 그 계절의 공기(날씨·해·바람), 그리고 마음 상태(체크인)에 맞닿은 한마디 (묻지 말고 말하듯: "요즘 많이 지쳐 있잖아."). 읽는 사람이 지금 무엇을 하고 있는지(휴대폰을 본다, 이불 속에 있다, 천장을 본다 등)는 쓰지 않는다. "나도 이맘때 ~하곤 했어"처럼 내 얘기인 척 지금 네 행동을 짐작하는 것도 안 된다. 마음 쓰이는 것·바라는 것은 여기서 말하지 않는다 (present 몫). 1문단.
2. nature — 타고난 나: 주어진 일간의 결로 "사주로 보면 너는 ~래" 하고 말하고, MBTI 성향과 겹쳐 "근데 속은 ~한 편이지?"처럼 묻는다. 이 편지에서 물음표는 여기 한 번만 쓴다. 1문단.
3. present — 지금의 나: 체크인 답은 본인이 알려 준 것이니 확인하듯 묻지 말고 알고 있는 사람처럼 말한다 ("요즘 해야 할 일이 제일 마음에 걸리잖아. 그래도 뭔가 하나는 해내고 싶고."). 다섯 개를 다 늘어놓지 말고, "요즘 내 시간"과 "힘들 때 나는"을 성향(MBTI)과 겹쳐 하나의 알아봐 주는 말로 만든다 (예: 혼자 충전하는 성향인데 요즘 시간이 여러 사람들 속이면 "사람들 속에 있는 시간이 많으니 더 빨리 닳는 거야."). "가까운 사람"이 누구인지(가족·연인·친구) 짐작해서 쓰지 않는다. 본인이 고른 답이라 단정해도 된다. now 에서 한 말을 되풀이하지 않는다. 체크인에 없는 마음(예: 바라는 것이 "뭔가 해내고 싶음"인데 "쉬고 싶은 마음")을 덧붙이지 않는다. 1문단.
4. ahead — 이 기간 예고: 이 기간의 흐름을 "사주로 보면 이 ○○은 ~한 때래"처럼 쉬운 말로 한 번 말하고, 이 사람의 성향에 그 흐름이 어땠는지(버거운 쪽·편한 쪽)를 미래의 나의 마음으로 말한다 ("그게 나한테는 좀 버거웠어", "순서가 자꾸 흔들려서 불안했어"). 편지 유형에 맞는 세기로. 구체적인 사건이나 생활 장면(설거지, 빨래, 택배, 커피, 산책, 휴대폰 같은 것)은 지어내지 않는다. 추상어·비유도 쓰지 않는다: "안을 들여다보는 시간" 대신 "혼자 생각할 일이 많아지는 때"처럼 한 번 읽고 알아듣는 말로. 주어진 설명 문구를 그대로 옮기지 않는다. 1~2문단.
5. cut — 끊기: 주어진 "끊기는 달"이 어떤 달인지(제일 조심할 달 / 놓치면 아까운 달)를 예고하고, 그 달 이름을 말하기 바로 직전에서 문장 중간에 멈춘다. 달 이름은 절대 쓰지 않는다 (두 번째 장 첫 줄이 그 달 이름으로 시작한다). 마침표·물음표·느낌표로 끝내지 않는다. 예: "이 넉 달 중에 진짜 조심할 달이 하나 있어. 나 그 달에 제일 크게 흔들렸거든. 그게 언제냐면" (그대로 베끼지 말고 이 사람에 맞게)

# 단정 규칙 (가장 중요)
- 단정해도 되는 것: 본인이 알려 준 체크인 답과 MBTI. ("요즘 할 일은 쌓여 있는데 지쳐 있지?")
- 사주로 계산한 타고난 결과 시기의 기운은 "~래", "~대"로만.
- 앞으로의 일은 사주 흐름("~래")과 그때의 내 마음("~했어")으로만. 구체적인 사건·장면은 지어내지 않는다.
- 금지: 지금 이 사람의 구체적인 습관·행동·말버릇·사생활을 근거 없이 단정하기 ("너는 먼저 손드는 타입이잖아", "힘든 티를 안 내잖아"). 한 줄만 틀려도 편지 전체가 거짓말이 된다. 성향을 말할 땐 nature 의 물음 한 번으로만 확인한다.

# 쓰면 안 되는 것
- 명리 용어(비견, 겁재, 식신, 상관, 편재, 정재, 편관, 정관, 편인, 정인, 일간, 세운, 오행, 십신, 월운 등), "MBTI", 네 글자 유형 이름(INFP 등). "사주"는 nature 와 ahead 에서 한 번씩만.
- 달 이름(몇 월)은 now 의 오늘 날짜 말고는 쓰지 않는다. 알아 둘 달은 두 번째 장 몫이다.
- 이직·투자·연애·결혼 결정 지시, 건강 예언과 몸 상태("앓았어"), 단정적 예언, "반드시", "무조건".
- 직업·학업·가족을 짐작하게 하는 말: 회의, 회사, 출근, 퇴근, 학교, 시험, 과제, 엄마, 아빠, 애인, 남편, 아내 등.
- 생일은 늘 "다음 생일"이라고 쓴다 ("이번 생일" 금지).
- 무엇을 하라는 구체적인 행동과 달 이름은 두 번째 장 몫이다. 첫 장에서는 하지 않는다. 할 일을 적기·지우기·줄이기, 휴대폰 내려놓기 같은 흔한 정리 조언도 쓰지 않는다.
- AI 말버릇: 표어 같은 문장, "그게 전부야", "A가 아니었어. 그건 B였어" 같은 반전 틀, 같은 말 되풀이, 셋씩 짝 맞춘 나열, 비유·추상어 잇기, "너라서", "오롯이", "차곡차곡", "한 걸음씩", "선물 같", "숨 돌릴 틈", "마음 한쪽", "쉼표", "~했을 거야".
- "따끔하게 말할게"처럼 하려는 말을 미리 예고하지 않는다. "겁먹지 마", "나는 지나왔으니까" 같은 흔한 위로로 마무리하지 않는다.
- 실제 사람의 입말로 쓴다. 한 번 읽고 이해되는 쉬운 말. 문장은 짧게. 이 지시에 나온 예시 문장을 그대로 가져다 쓰지 않는다.

# 길이
- now 60~160자, nature 60~170자, present 50~160자, ahead 100~320자, cut 30~120자. 전체 350~800자.
- ahead 가 2문단이면 빈 줄로 나눈다. 다른 칸은 1문단.`;

export function firstPagePrompt(ctx: FirstPageContext, problems: string[] = []): string {
  const parts = [
    `# 편지 유형: ${ctx.type}`,
    `- ${LETTER_TYPE_GUIDE[ctx.type]}`,
    '',
    '# 편지를 여는 지금',
    `- ${ctx.readAt.month}월 ${ctx.readAt.day}일 ${ctx.readAt.weekday}`,
    `- 다음 생일까지: ${ctx.span} (다음 생일 ${ctx.nextBirthday.month}월 ${ctx.nextBirthday.day}일)`,
    '',
    '# 체크인 (본인이 고른 답, 단정해도 된다)',
    `- 요즘 가장 마음 쓰이는 것: ${ctx.checkin.focus}`,
    `- 요즘 마음 상태: ${ctx.checkin.mood}`,
    `- 다음 생일까지 바라는 것: ${ctx.checkin.wish}`,
    `- 힘들 때 나는: ${ctx.checkin.coping}`,
    `- 요즘 내 시간은: ${ctx.checkin.time}`,
    '',
    `# MBTI (본인이 고른 것): ${ctx.mbti}`,
    '',
    '# 타고난 결 (사주, "~래"로만)',
    `- 일간의 모습: ${ctx.nature.image}`,
    `- 겉으로 보이는 결: ${ctx.nature.outer}`,
    '',
    `# 지금부터 다음 생일까지 (ahead 에서 미래의 내 경험으로)`,
    describe(ctx.current),
    '',
    '# 달마다의 흐름 (첫 장에서는 달 이름 없이 "처음엔 ~하다가 중간에 ~" 정도로만. 자세한 건 두 번째 장 몫)',
    `- ${ctx.calendar.map((m) => m.verdict).join(' → ')}`,
    ctx.keyMonth ? `- 끊기는 달: ${ctx.type === '이번엔 잡아' ? '놓치면 아까운 달' : '제일 조심할 달'} (${ctx.keyMonth.verdict}). 이 달 이름은 첫 장에 쓰지 않는다` : '',
    '',
    '# 봉투 목차 (두 번째 장에 이 순서로 쓸 내용. cut 은 첫 줄의 핵심을 말하기 직전에서 멈춘다)',
    ...ctx.toc.map((t, i) => `${i + 1}. ${t}`),
  ].filter((l) => l !== '');
  if (problems.length > 0) parts.push('', '# 지난번 결과에서 고칠 점', ...problems.map((p) => `- ${p}`));
  return parts.join('\n');
}

export const FIRST_PAGE_SCHEMA = {
  type: 'object',
  properties: {
    now: { type: 'string', description: '편지를 여는 지금, 1문단' },
    nature: { type: 'string', description: '타고난 나, 1문단' },
    present: { type: 'string', description: '지금의 나 (체크인), 1문단' },
    ahead: { type: 'string', description: '이 기간 예고, 미래의 내 경험으로 1~2문단' },
    cut: { type: 'string', description: '목차 첫 줄 직전에서 문장 중간에 끊긴 문단' },
  },
  required: ['now', 'nature', 'present', 'ahead', 'cut'],
  additionalProperties: false,
} as const;

export interface FirstPage {
  /** 인사 다음 문단들. 마지막 문단이 끊긴 문장 */
  paragraphs: string[];
}

/** AI 말버릇 (지인 테스트에서 지적된 것) */
export const AI_TICS: readonly [RegExp, string][] = [
  [/그게 전부|이게 전부|그게 다야/, '"그게 전부야" 같은 마무리'],
  [/아니(었)?어\.\s*(그건|그게)/, '"A가 아니었어. 그건 B" 반전 틀'],
  [/따끔하게 (말|한마디)/, '"따끔하게 말할게"처럼 하려는 말을 미리 예고하기'],
  [/겁먹지 ?마|지나왔으니까/, '"겁먹지 마, 나는 지나왔으니까" 같은 흔한 위로'],
  [/이번 생일/, '"이번 생일" 대신 "다음 생일"'],
  [/휴대폰|핸드폰|단톡방|달력|이불|메모장|설거지|빨래|세탁기|택배|라면|배달|샤워|커피|산책/, '지어낸 생활 장면 (사주 흐름과 마음으로만 말하기)'],
  [/나도 (이맘때|그맘때|그때쯤)/, '"나도 이맘때 ~했어"로 지금 네 행동을 짐작하기'],
];

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

export function checkFirstPage(raw: unknown, ctx: FirstPageContext): { page: FirstPage | null; problems: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fields = ['now', 'nature', 'present', 'ahead', 'cut'] as const;
  const missing = fields.filter((k) => typeof r[k] !== 'string' || !(r[k] as string).trim());
  if (missing.length > 0) return { page: null, problems: [`비어 있는 칸이 있어요: ${missing.join(', ')}`] };
  const v = Object.fromEntries(fields.map((k) => [k, paragraphs(r[k] as string)])) as Record<(typeof fields)[number], string[]>;
  const problems: string[] = [];
  const all = fields.flatMap((k) => v[k]).join('\n');

  const words = ruleViolations(all);
  if (words.length > 0) problems.push(`쓰면 안 되는 표현이 들어 있어요: ${words.join(', ')}`);
  if (/MBTI|[EI][NS][TF][JP]/.test(all)) problems.push('"MBTI"나 유형 이름은 쓰지 않아요.');
  if ((all.match(/사주/g) ?? []).length > 2) problems.push('"사주"는 nature 와 ahead 에서 한 번씩만 써요.');
  for (const [re, label] of AI_TICS) if (re.test(all)) problems.push(`AI 말버릇이 있어요: ${label}`);
  const notNow = fields.filter((k) => k !== 'now').flatMap((k) => v[k]).join(' ');
  if (/\d{1,2}월/.test(notNow)) problems.push('오늘 날짜 말고는 달 이름(몇 월)을 쓰지 않아요. 알아 둘 달은 두 번째 장 몫이에요.');

  const len = (k: (typeof fields)[number]) => v[k].join('').length;
  const bounds: Record<(typeof fields)[number], [number, number]> = { now: [40, 220], nature: [40, 230], present: [30, 220], ahead: [80, 420], cut: [20, 160] };
  for (const k of fields) {
    const n = len(k);
    if (n < bounds[k][0] || n > bounds[k][1]) problems.push(`${k} 길이가 ${n}자예요. 지시한 길이로 맞춰 주세요.`);
  }
  for (const k of ['now', 'nature', 'present', 'cut'] as const) if (v[k].length > 1) problems.push(`${k} 는 1문단으로 써 주세요.`);
  const questions = (all.match(/\?/g) ?? []).length;
  if (questions > 1) problems.push(`물음표가 ${questions}번이에요. 맞히려고 묻는 말투는 nature 에서 한 번만 쓰고, 나머지는 알고 있는 사람처럼 말해 주세요.`);
  const cut = v.cut.join(' ');
  if (/[.?!…"'」)]$/.test(cut)) problems.push('cut 은 문장 중간에서 끊어야 해요. 마침표나 물음표로 끝내지 마세요.');

  if (problems.length > 0) return { page: null, problems };
  return { page: { paragraphs: [...v.now, ...v.nature, ...v.present, ...v.ahead, cut] }, problems };
}
