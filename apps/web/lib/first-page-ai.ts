// 첫 장 AI 생성 (서버 전용). 재료·지시·검사는 @naite/letter 의 first-page-ai.ts.
import 'server-only';
import { FIRST_PAGE_SCHEMA, FIRST_PAGE_SYSTEM, checkFirstPage, firstPagePrompt, type FirstPage, type FirstPageContext } from '@naite/letter';
import { jsonCall } from './claude';

/** 첫 장은 모든 방문자에게 무료라 모델을 따로 둔다 (CLAUDE.md 9) */
export const FIRST_PAGE_MODEL = process.env.FIRST_PAGE_MODEL?.trim() || 'claude-sonnet-5-5';
const MAX_ATTEMPTS = 2;

export interface FirstPageGeneration {
  page: FirstPage | null;
  attempts: number;
  /** 마지막 시도에서 걸린 규칙 */
  problems: string[];
  usage: { input: number; output: number };
}

/** 규칙을 통과한 첫 장. 끝내 통과하지 못하면 page = null (호출한 쪽이 템플릿 편지로 대신한다) */
export async function generateFirstPage(ctx: FirstPageContext): Promise<FirstPageGeneration> {
  let problems: string[] = [];
  const usage = { input: 0, output: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await jsonCall({ model: FIRST_PAGE_MODEL, effort: 'medium', system: FIRST_PAGE_SYSTEM, user: firstPagePrompt(ctx, problems), schema: FIRST_PAGE_SCHEMA });
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    const checked = checkFirstPage(r.json, ctx);
    console.log('[first-page] attempt', attempt, checked.page ? 'ok' : 'rejected', `in=${r.usage.input} out=${r.usage.output}`);
    if (checked.page) return { page: checked.page, attempts: attempt, problems: [], usage };
    problems = checked.problems;
  }
  return { page: null, attempts: MAX_ATTEMPTS, problems, usage };
}
