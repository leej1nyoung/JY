// 자동 검사 결과 요약. 브라우저에서도 쓰므로 무거운 의존성(사주 계산)을 import 하지 않는다.
import type { LetterType } from './checkin.ts';

export interface EvalResult {
  id: number;
  type: LetterType;
  summary: string;
  letter: string;
  /** 생성 실패(규칙 검사를 끝내 통과 못 함 등) */
  failed: string | null;
  attempts: number;
  ruleProblems: string[];
  who: { correct: boolean; pick: number; answer: number; reason: string } | null;
  quality: { unfounded: string[]; aiTone: string[]; specificity: number; curiosity: number; hitLine: string } | null;
  tokens: { input: number; output: number };
}

/** 나쁜 순으로 정렬하기 위한 벌점 (클수록 나쁨) */
export function badness(r: EvalResult): number {
  if (r.failed) return 100;
  const q = r.quality;
  return (r.who && !r.who.correct ? 10 : 0) + (q ? q.unfounded.length * 8 + q.aiTone.length * 3 + (5 - q.specificity) * 2 + (5 - q.curiosity) : 0);
}

export interface EvalReport {
  total: number;
  generated: number;
  whoAccuracy: number | null;
  noUnfounded: number;
  avgSpecificity: number | null;
  avgCuriosity: number | null;
  byType: Record<string, { n: number; whoCorrect: number }>;
  worst: EvalResult[];
}

export function summarize(results: EvalResult[]): EvalReport {
  const ok = results.filter((r) => !r.failed);
  const judged = ok.filter((r) => r.who);
  const q = ok.map((r) => r.quality).filter((x): x is NonNullable<EvalResult['quality']> => x !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const byType: EvalReport['byType'] = {};
  for (const r of ok) {
    byType[r.type] ??= { n: 0, whoCorrect: 0 };
    byType[r.type]!.n++;
    if (r.who?.correct) byType[r.type]!.whoCorrect++;
  }
  return {
    total: results.length,
    generated: ok.length,
    whoAccuracy: judged.length ? Math.round((judged.filter((r) => r.who!.correct).length / judged.length) * 100) : null,
    noUnfounded: q.filter((x) => x.unfounded.length === 0).length,
    avgSpecificity: avg(q.map((x) => x.specificity)),
    avgCuriosity: avg(q.map((x) => x.curiosity)),
    byType,
    worst: [...results].sort((a, b) => badness(b) - badness(a)).slice(0, 3),
  };
}
