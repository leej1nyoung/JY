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

export function isSecondPageEnabled(): boolean {
  return process.env.SECOND_PAGE_FREE === 'on' && Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
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
