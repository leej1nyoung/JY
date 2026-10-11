// Claude 호출 공통 (서버 전용): 구조화 출력(JSON) 한 번 받기.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  return client;
}

export class ClaudeCallError extends Error {}

export interface JsonCallResult {
  json: unknown;
  usage: { input: number; output: number };
}

export async function jsonCall(opts: {
  model: string;
  effort: 'low' | 'medium' | 'high';
  system: string;
  user: string;
  schema: Record<string, unknown>;
}): Promise<JsonCallResult> {
  const message = await anthropic()
    .beta.messages.stream({
      model: opts.model,
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버에서 추천 모델로 다시 시도한다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort, format: { type: 'json_schema', schema: opts.schema } },
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    })
    .finalMessage();
  if (message.stop_reason === 'refusal') throw new ClaudeCallError('refusal');
  if (message.stop_reason === 'max_tokens') throw new ClaudeCallError('max_tokens');
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { json, usage: { input: message.usage.input_tokens, output: message.usage.output_tokens } };
}
