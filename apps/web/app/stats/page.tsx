import type { Metadata } from 'next';
import { timingSafeEqual } from 'node:crypto';
import { buildFunnel, type FunnelRow } from '@/lib/events';
import { isStoreConfigured, loadCounts } from '@/lib/event-store';
import { Logo } from '@/components/Logo';
import { NoTrack } from './NoTrack';

export const metadata: Metadata = { title: '측정 — 나이테' };
export const dynamic = 'force-dynamic';

function keyMatches(given: string | undefined): boolean {
  const expected = process.env.STATS_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!keyMatches(key)) {
    return (
      <main className="page">
        <Logo />
        <p className="form-lead" style={{ marginTop: 28 }}>이 페이지를 볼 수 없어요.</p>
      </main>
    );
  }

  let rows: FunnelRow[] | null = null;
  let error: string | null = null;
  if (!isStoreConfigured()) error = 'Supabase 연결 정보(SUPABASE_URL, SUPABASE_SECRET_KEY)가 아직 설정되지 않았어요.';
  else {
    try {
      rows = buildFunnel(await loadCounts());
    } catch (e) {
      error = `집계를 불러오지 못했어요. (${e instanceof Error ? e.message : '알 수 없는 오류'})`;
    }
  }

  return (
    <main className="page">
      <Logo />
      <h1 className="form-title">지인 테스트 측정</h1>
      <p className="form-lead">방문자 수는 같은 브라우저를 한 명으로 셉니다. 비율은 바로 앞 단계 대비, 괄호는 메인 진입 대비예요.</p>
      <NoTrack />
      {error && <p className="error">{error}</p>}
      {rows && (
        <table className="funnel">
          <thead>
            <tr>
              <th>단계</th>
              <th>방문자</th>
              <th>전환</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.event}>
                <td>{r.label}</td>
                <td className="num">{r.visitors}</td>
                <td className="num">
                  {r.fromPrev === null ? '–' : `${r.fromPrev}%`}
                  {r.fromFirst !== null && <small> ({r.fromFirst}%)</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
