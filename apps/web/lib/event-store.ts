// 이벤트 저장소. Supabase(PostgREST)에 서버에서만 접근한다.
// SUPABASE_URL / SUPABASE_SECRET_KEY 가 없으면 저장하지 않는다 (로컬 개발, 연결 전 배포).
import 'server-only';
import type { TrackedEvent } from './events';

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function headers(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // 예전 형식(JWT) 키는 Authorization 헤더도 요구한다. 새 형식(sb_secret_…)은 apikey 만으로 된다.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

export function isStoreConfigured(): boolean {
  return config() !== null;
}

export async function saveEvent(e: TrackedEvent): Promise<void> {
  const c = config();
  if (!c) return;
  const res = await fetch(`${c.url}/rest/v1/events`, {
    method: 'POST',
    headers: { ...headers(c.key), Prefer: 'return=minimal' },
    body: JSON.stringify({ visitor_id: e.visitorId, event: e.event, path: e.path }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`event insert failed: ${res.status}`);
}

export async function loadCounts(): Promise<{ event: string; visitors: number; total: number }[]> {
  const c = config();
  if (!c) throw new Error('not configured');
  const res = await fetch(`${c.url}/rest/v1/event_funnel?select=event,visitors,total`, {
    headers: headers(c.key),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`funnel query failed: ${res.status}`);
  const rows = (await res.json()) as { event: string; visitors: number | string; total: number | string }[];
  return rows.map((r) => ({ event: r.event, visitors: Number(r.visitors), total: Number(r.total) }));
}
