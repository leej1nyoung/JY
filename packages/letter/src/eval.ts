// 첫 장 AI 자동 검사 (지인 테스트 전 품질 확인). 가상의 사람들, 채점관 지시, 점수 계산.
// AI 호출은 웹 서버(/eval)에서 한다. 여기는 순수 함수만 둔다.
import { BIRTHPLACES } from '@naite/saju';
import { CHECKIN_FOCUS, CHECKIN_MOOD, CHECKIN_WISH, type Checkin, type LetterType } from './checkin.ts';
import { createFirstPageContext, type FirstPageContext } from './first-page-ai.ts';
import type { FirstLetterRequest } from './first-letter.ts';

export interface EvalProfile {
  id: number;
  req: FirstLetterRequest;
  checkin: Checkin;
}

/** 재현 가능한 의사 난수 (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MBTIS = ['E', 'I'].flatMap((a) => ['N', 'S'].flatMap((b) => ['T', 'F'].flatMap((c) => ['J', 'P'].map((d) => a + b + c + d))));

/**
 * 가상의 사람 n명. 편지 유형 4가지가 고르게 섞이도록 고르고, 태어난 시간 모름·나이 차이·약한 조합(무난함)도 일부러 넣는다.
 * 같은 seed·createdAt 이면 늘 같은 사람들.
 */
export function evalProfiles(n: number, createdAt: Date, seed = 20261011): EvalProfile[] {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const places = BIRTHPLACES.filter((p) => p.code !== 'abroad');
  const perType = Math.ceil(n / 4);
  const count: Record<LetterType, number> = { '미리 알려 줄게': 0, '이것만은 지켜': 0, '이번엔 잡아': 0, '방향을 고를 때': 0 };
  const out: EvalProfile[] = [];
  for (let tries = 0; out.length < n && tries < 5000; tries++) {
    const year = 1970 + Math.floor(rand() * 40); // 1970~2009
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const unknownTime = rand() < 0.15;
    const req: FirstLetterRequest = {
      calendar: 'solar', year, month, day, isLeapMonth: false,
      time: unknownTime ? null : { hour: Math.floor(rand() * 24), minute: Math.floor(rand() * 60) },
      birthplaceCode: pick(places).code,
      mbti: pick(MBTIS),
      name: null,
      birthdayBasis: 'solar',
      confirmSelf: true,
      confirmAge: true,
    };
    const checkin: Checkin = { focus: pick(CHECKIN_FOCUS), mood: pick(CHECKIN_MOOD), wish: pick(CHECKIN_WISH) };
    const ctx = createFirstPageContext(req, checkin, createdAt);
    if (!ctx.ok) continue;
    const t = ctx.context.type;
    if (count[t] >= perType) continue;
    count[t]++;
    out.push({ id: out.length + 1, req, checkin });
  }
  return out;
}

/** "이 편지 누구 거야?" 테스트에 보여 줄 사람 요약 (편지에 직접 쓰이는 재료만) */
export function profileSummary(ctx: FirstPageContext): string {
  const hard = ctx.current.feelings.filter((f) => f.feeling === '버거움').map((f) => f.mind);
  const easy = ctx.current.feelings.filter((f) => f.feeling === '편함').map((f) => f.mind);
  return [
    `MBTI ${ctx.mbti}`,
    `요즘 마음 쓰이는 것: ${ctx.checkin.focus} / 마음 상태: ${ctx.checkin.mood} / 바라는 것: ${ctx.checkin.wish}`,
    `타고난 결: ${ctx.nature.image}`,
    `지금부터 다음 생일까지(${ctx.span}): ${ctx.current.situation}` +
      (hard.length ? ` / 버거운 쪽: ${hard.join(', ')}` : '') +
      (easy.length ? ` / 편한 쪽: ${easy.join(', ')}` : ''),
  ].join('\n');
}

export const WHO_SYSTEM = `너는 편지가 누구를 위해 쓰였는지 맞히는 채점관이다.
편지 한 통과 사람 4명의 요약을 보고, 이 편지가 누구를 위해 쓰였을 가능성이 가장 큰지 하나를 고른다.
편지의 내용(지금의 마음, 고민, 성향, 다가올 시기)이 요약과 얼마나 구체적으로 맞는지만 보고 판단한다. 확신이 없어도 하나를 고른다.`;

export function whoPrompt(letter: string, options: string[]): string {
  return ['# 편지', letter, '', ...options.flatMap((o, i) => [`# 후보 ${i + 1}`, o, ''])].join('\n');
}

export const WHO_SCHEMA = {
  type: 'object',
  properties: {
    pick: { type: 'integer', description: '편지 주인으로 가장 그럴듯한 후보 번호 (1~4)' },
    reason: { type: 'string', description: '한 문장' },
  },
  required: ['pick', 'reason'],
  additionalProperties: false,
} as const;

export const QUALITY_SYSTEM = `너는 "미래의 내가 보낸 편지" 서비스의 첫 장을 검수하는 까다로운 편집자다. 읽는 사람 입장에서 냉정하게 본다.
확인할 것:
1. unfounded — 근거 없이 단정한 문장: 이 사람이 알려 준 정보(체크인 답, MBTI)나 "사주로 보면 ~래"처럼 전해 듣는 말투가 아닌데, 지금 이 사람의 구체적인 습관·행동·말버릇·사생활을 사실처럼 단정한 문장. (앞으로의 일을 "나는 그때 ~했어"라고 미래의 경험으로 말한 것은 괜찮다.)
2. aiTone — AI가 쓴 티가 나는 문장: 표어 같은 문장, 반전 틀("A가 아니었어. 그건 B"), 셋씩 짝 맞춘 나열, 추상적인 말 잇기, 과하게 매끈한 문장.
3. specificity — 이 사람에게만 해당하는 구체성 (1: 누구에게나 할 수 있는 말뿐 ~ 5: 이 사람의 답과 시기가 구체적으로 녹아 있음).
4. curiosity — 마지막 끊긴 문장 때문에 두 번째 장을 열고 싶어지는 정도 (1~5).
5. hitLine — 이 사람이 "이거 내 얘기다" 할 만한 가장 좋은 문장 하나 (그대로 인용, 없으면 빈 문자열).
문장을 인용할 때는 편지에 있는 그대로 옮긴다.`;

export function qualityPrompt(letter: string, ctx: FirstPageContext): string {
  return ['# 이 사람이 알려 준 정보와 계산된 사주 요약', profileSummary(ctx), '', '# 편지 첫 장', letter].join('\n');
}

export const QUALITY_SCHEMA = {
  type: 'object',
  properties: {
    unfounded: { type: 'array', items: { type: 'string' } },
    aiTone: { type: 'array', items: { type: 'string' } },
    specificity: { type: 'integer' },
    curiosity: { type: 'integer' },
    hitLine: { type: 'string' },
  },
  required: ['unfounded', 'aiTone', 'specificity', 'curiosity', 'hitLine'],
  additionalProperties: false,
} as const;

export { badness, summarize, type EvalReport, type EvalResult } from './eval-report.ts';
