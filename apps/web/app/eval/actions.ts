'use server';

// 첫 장 AI 자동 검사 (운영자 전용). 가상의 사람 한 명씩: 첫 장 생성 → "누구 거야?" 채점 → 품질 채점.
import {
  QUALITY_SCHEMA, QUALITY_SYSTEM, WHO_SCHEMA, WHO_SYSTEM, createFirstPageContext, evalProfiles, profileSummary, qualityPrompt, whoPrompt,
  type EvalResult,
} from '@naite/letter';
import { jsonCall } from '@/lib/claude';
import { generateFirstPage } from '@/lib/first-page-ai';
import { keyMatches } from '@/lib/stats-key';

const EVAL_SIZE = 40;
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL?.trim() || 'claude-opus-5-5';

export async function runEvalCase(key: string, index: number, createdAtIso: string): Promise<EvalResult | { error: string }> {
  if (!keyMatches(key)) return { error: '키가 맞지 않아요.' };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY 가 없어요.' };
  const createdAt = new Date(createdAtIso);
  if (!Number.isFinite(createdAt.getTime())) return { error: '시각이 이상해요.' };
  const profiles = evalProfiles(EVAL_SIZE, createdAt);
  const p = profiles[index];
  if (!p) return { error: '없는 번호예요.' };

  const built = createFirstPageContext(p.req, p.checkin, createdAt);
  if (!built.ok) return { error: built.message };
  const ctx = built.context;
  const summary = profileSummary(ctx);
  const base: EvalResult = {
    id: p.id, type: ctx.type, summary, letter: '', failed: null, attempts: 0, ruleProblems: [], who: null, quality: null, tokens: { input: 0, output: 0 },
  };

  try {
    const gen = await generateFirstPage(ctx);
    base.attempts = gen.attempts;
    base.tokens = { ...gen.usage };
    if (!gen.page) return { ...base, failed: '규칙 검사를 끝내 통과 못 함', ruleProblems: gen.problems };
    const letter = [built.greeting, ...gen.page.paragraphs].join('\n\n') + '▍';

    // "이 편지 누구 거야?": 진짜 주인 1명 + 체크인·MBTI 가 다른 가짜 3명, 자리는 번호로 섞는다
    const decoys = [7, 13, 29]
      .map((d) => profiles[(index + d) % profiles.length]!)
      .map((q) => createFirstPageContext(q.req, q.checkin, createdAt))
      .flatMap((r) => (r.ok ? [profileSummary(r.context)] : []))
      .filter((s) => s !== summary)
      .slice(0, 3);
    const answer = (index % 4) + 1;
    const options = [...decoys];
    options.splice(answer - 1, 0, summary);

    const [who, quality] = await Promise.all([
      jsonCall({ model: JUDGE_MODEL, effort: 'medium', system: WHO_SYSTEM, user: whoPrompt(letter, options), schema: WHO_SCHEMA }),
      jsonCall({ model: JUDGE_MODEL, effort: 'medium', system: QUALITY_SYSTEM, user: qualityPrompt(letter, ctx), schema: QUALITY_SCHEMA }),
    ]);
    const w = (who.json ?? {}) as { pick?: number; reason?: string };
    const q = quality.json as EvalResult['quality'];
    return {
      ...base,
      letter,
      who: { correct: w.pick === answer, pick: Number(w.pick ?? 0), answer, reason: String(w.reason ?? '') },
      quality: q,
      tokens: { input: base.tokens.input + who.usage.input + quality.usage.input, output: base.tokens.output + who.usage.output + quality.usage.output },
    };
  } catch (e) {
    console.error('[eval] case', index, e instanceof Error ? e.name : 'unknown');
    return { ...base, failed: '호출 실패 (잠시 뒤 이 번호만 다시)' };
  }
}
