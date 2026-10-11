'use client';

import { useEffect, useRef, useState } from 'react';
import { summarize, type EvalResult } from '@naite/letter/eval-report';
import { runEvalCase } from './actions';

const SIZE = 12;
const CONCURRENCY = 4;
const STORE = 'naite:eval:12';

interface Run {
  createdAt: string;
  results: Record<number, EvalResult>;
}

function load(): Run | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Run) : null;
  } catch {
    return null;
  }
}
function save(run: Run) {
  try {
    localStorage.setItem(STORE, JSON.stringify(run));
  } catch {
    // 무시
  }
}

export function EvalRunner({ secret }: { secret: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<Run | null>(null);

  useEffect(() => {
    const r = load();
    runRef.current = r;
    setRun(r);
  }, []);

  async function go(fresh: boolean) {
    if (busy) return;
    setError(null);
    let r = runRef.current;
    if (fresh || !r) r = { createdAt: new Date().toISOString(), results: {} };
    runRef.current = r;
    setRun({ ...r });
    save(r);
    setBusy(true);
    // 아직 없거나 실패한 번호만
    const todo = Array.from({ length: SIZE }, (_, i) => i).filter((i) => !r!.results[i + 1] || r!.results[i + 1]!.failed);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const i = todo[next++]!;
        try {
          const res = await runEvalCase(secret, i, r!.createdAt);
          if ('error' in res) {
            setError(res.error);
            continue;
          }
          r!.results[res.id] = res;
        } catch {
          setError('연결이 끊긴 번호가 있어요. 끝나고 "이어서 하기"를 눌러 주세요.');
        }
        save(r!);
        setRun({ ...r!, results: { ...r!.results } });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setBusy(false);
  }

  const results = run ? Object.values(run.results) : [];
  const report = results.length ? summarize(results) : null;
  const done = results.filter((x) => !x.failed).length;
  const tokens = results.reduce((a, x) => ({ input: a.input + x.tokens.input, output: a.output + x.tokens.output }), { input: 0, output: 0 });

  return (
    <section>
      <div className="eval-actions">
        <button className="btn" type="button" disabled={busy} onClick={() => go(!run)}>
          {busy ? `검사 중… ${results.length}/${SIZE}` : run ? '이어서 하기 (빠진 번호·실패한 번호만)' : `${SIZE}통 검사 시작`}
        </button>
        {run && !busy && (
          <button className="btn btn-soft" type="button" onClick={() => go(true)}>
            처음부터 새로 검사
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {report && (
        <>
          <h2 className="stats-sub">요약 ({done}/{SIZE}통 생성)</h2>
          <table className="funnel">
            <tbody>
              <tr><td>"이 편지 누구 거야?" 맞힌 비율 (4명 중 1명, 아무렇게나 고르면 25%)</td><td className="num">{report.whoAccuracy ?? '–'}%</td></tr>
              <tr><td>근거 없는 단정이 하나도 없는 편지</td><td className="num">{report.noUnfounded}/{done}</td></tr>
              <tr><td>구체성 평균 (1~5)</td><td className="num">{report.avgSpecificity ?? '–'}</td></tr>
              <tr><td>두 번째 장 궁금함 평균 (1~5)</td><td className="num">{report.avgCuriosity ?? '–'}</td></tr>
              <tr><td>규칙 검사 끝내 실패 (템플릿으로 대신될 편지)</td><td className="num">{results.filter((x) => x.failed).length}</td></tr>
              <tr><td>사용 토큰 (입력 / 출력)</td><td className="num">{tokens.input.toLocaleString()} / {tokens.output.toLocaleString()}</td></tr>
            </tbody>
          </table>

          <h2 className="stats-sub">유형별 "누구 거야?" 맞힌 수</h2>
          <table className="funnel">
            <tbody>
              {Object.entries(report.byType).map(([t, v]) => (
                <tr key={t}><td>{t}</td><td className="num">{v.whoCorrect}/{v.n}</td></tr>
              ))}
            </tbody>
          </table>

          <h2 className="stats-sub">가장 나쁜 3통</h2>
          {report.worst.map((r) => (
            <article key={r.id} className="eval-case">
              <p className="eval-meta">#{r.id} · {r.type}{r.failed ? ` · ${r.failed}` : ''}</p>
              <pre className="eval-summary">{r.summary}</pre>
              {r.letter && <div className="eval-letter">{r.letter.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>}
              <ul className="eval-notes">
                {r.who && <li>누구 거야?: {r.who.correct ? '맞힘' : `틀림 (정답 ${r.who.answer}, 고른 것 ${r.who.pick})`} — {r.who.reason}</li>}
                {r.quality?.unfounded.map((l, i) => <li key={`u${i}`}>근거 없는 단정: “{l}”</li>)}
                {r.quality?.aiTone.map((l, i) => <li key={`a${i}`}>AI 티: “{l}”</li>)}
                {r.quality && <li>구체성 {r.quality.specificity} · 궁금함 {r.quality.curiosity}</li>}
                {r.quality?.hitLine && <li>제일 좋은 줄: “{r.quality.hitLine}”</li>}
                {r.ruleProblems.map((l, i) => <li key={`r${i}`}>규칙: {l}</li>)}
              </ul>
            </article>
          ))}

          <details className="eval-all">
            <summary>전체 {results.length}통 보기 (원할 때만)</summary>
            {[...results].sort((a, b) => a.id - b.id).map((r) => (
              <article key={r.id} className="eval-case">
                <p className="eval-meta">#{r.id} · {r.type} · {r.who ? (r.who.correct ? '주인 맞힘' : '주인 못 맞힘') : r.failed}</p>
                {r.letter && <div className="eval-letter">{r.letter.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>}
              </article>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
