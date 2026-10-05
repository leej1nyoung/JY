// 두 번째 장 AI 생성 (서버 전용). 재료·지시·검사는 @naite/letter 의 second-page.ts 에 있다.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  SECOND_PAGE_SCHEMA, SECOND_PAGE_SYSTEM, checkSecondPage, secondPagePrompt,
  type SecondPage, type SecondPageContext,
} from '@naite/letter';

/** 모델은 환경변수로 바꿀 수 있다 (CLAUDE.md 9) */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5';
/** 검사에 걸리면 고칠 점을 알려 주고 한 번 더 쓰게 한다 */
const MAX_ATTEMPTS = 2;

export class SecondPageError extends Error {}

/** 환경변수 값을 드러내지 않고 켜짐 여부와 이유만 알려 준다 (/stats 에 표시) */
export function secondPageStatus(): { enabled: boolean; reason: string } {
  // 공백·따옴표·대문자로 넣어도 켜지게 한다 ("On", " on", "\"on\"", true, 1)
  const flag = (process.env.SECOND_PAGE_FREE ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  const on = ['on', 'true', '1', 'yes'].includes(flag);
  const key = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!on) return { enabled: false, reason: flag ? 'SECOND_PAGE_FREE 값이 on 이 아니에요' : 'SECOND_PAGE_FREE 가 없어요' };
  if (!key) return { enabled: false, reason: 'ANTHROPIC_API_KEY 가 없어요' };
  if (!key.startsWith('sk-ant-')) return { enabled: true, reason: '켜져 있어요 (다만 ANTHROPIC_API_KEY 가 보통의 sk-ant- 형식이 아니에요. 키를 다시 확인해 주세요)' };
  return { enabled: true, reason: '켜져 있어요' };
}

export function isSecondPageEnabled(): boolean {
  return secondPageStatus().enabled;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  return client;
}

async function once(ctx: SecondPageContext, problems: string[]): Promise<unknown> {
  const message = await anthropic()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버에서 추천 모델로 다시 시도한다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SECOND_PAGE_SCHEMA } },
      system: SECOND_PAGE_SYSTEM,
      messages: [{ role: 'user', content: secondPagePrompt(ctx, problems) }],
    })
    .finalMessage();

  if (message.stop_reason === 'refusal') throw new SecondPageError('refusal');
  if (message.stop_reason === 'max_tokens') throw new SecondPageError('max_tokens');
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 규칙을 통과한 두 번째 장. 끝내 통과하지 못하면 SecondPageError */
export async function generateSecondPage(ctx: SecondPageContext): Promise<SecondPage> {
  let problems: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const checked = checkSecondPage(await once(ctx, problems), ctx);
    console.log('[second-page] attempt', attempt, `${Math.round((Date.now() - started) / 1000)}s`, checked.problems.length === 0 ? 'ok' : 'rejected');
    if (checked.page && checked.problems.length === 0) return checked.page;
    problems = checked.problems;
    console.warn('[second-page] retry', attempt, problems.join(' / '));
  }
  throw new SecondPageError('rules');
}
