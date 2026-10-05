// 이벤트 저장소. Supabase(PostgREST)에 서버에서만 접근한다.
// SUPABASE_URL / SUPABASE_SECRET_KEY 가 없으면 저장하지 않는다 (로컬 개발, 연결 전 배포).
import 'server-only';
import type { TrackedEvent } from './events';

/** 설정 값이 잘못 들어갔을 때 던지는 오류. 메시지에 환경변수 값을 절대 넣지 않는다 */
export class StoreConfigError extends Error {}

function config() {
  // 프로젝트 URL 만 필요하다. 실수로 붙여 넣은 /rest/v1/ 이나 끝의 / 는 떼어 낸다.
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** 값을 드러내지 않고 설정이 맞는지만 확인한다 */
function checked(c: { url: string; key: string }): { url: string; key: string } {
  // 로컬 점검용 가짜 서버(http://localhost:포트)도 허용한다
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url) && !/^http:\/\/localhost:\d+$/.test(c.url)) {
    throw new StoreConfigError(
      c.url.startsWith('sb_') || c.url.startsWith('eyJ')
        ? 'SUPABASE_URL 칸에 주소가 아니라 키가 들어 있어요. https://(프로젝트 ID).supabase.co 를 넣어 주세요.'
        : 'SUPABASE_URL 형식이 달라요. https://(프로젝트 ID).supabase.co 형식이어야 해요.',
    );
  }
  if (c.key.startsWith('https://')) {
    throw new StoreConfigError('SUPABASE_SECRET_KEY 칸에 키가 아니라 주소가 들어 있어요.');
  }
  return c;
}

/** 네트워크 오류 메시지에는 요청 주소가 섞일 수 있어서 값 없이 다시 던진다 */
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new StoreConfigError('Supabase에 연결하지 못했어요. SUPABASE_URL을 확인해 주세요.');
  }
}

function headers(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // 예전 형식(JWT) 키는 Authorization 헤더도 요구한다. 새 형식(sb_secret_…)은 apikey 만으로 된다.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

/** 키 종류 (오류 안내용, 키 값 자체는 드러내지 않는다) */
function keyKind(key: string): string {
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable — secret 키가 아니에요';
  if (key.startsWith('eyJ')) return 'legacy JWT — service_role 키여야 해요';
  return '알 수 없는 형식';
}

/** PostgREST 오류 응답의 message 를 짧게 붙인다 */
async function failure(label: string, res: Response, key: string): Promise<Error> {
  let detail = '';
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) detail = ` ${body.message.slice(0, 160)}`;
  } catch {
    // 본문이 JSON 이 아니면 상태 코드만 쓴다
  }
  return new Error(`${label}: ${res.status}${detail} (키 종류: ${keyKind(key)})`);
}

export function isStoreConfigured(): boolean {
  return config() !== null;
}

export async function saveEvent(e: TrackedEvent): Promise<void> {
  const raw = config();
  if (!raw) return;
  const c = checked(raw);
  const res = await request(`${c.url}/rest/v1/events`, {
    method: 'POST',
    headers: { ...headers(c.key), Prefer: 'return=minimal' },
    body: JSON.stringify({ visitor_id: e.visitorId, event: e.event, path: e.path }),
    cache: 'no-store',
  });
  if (!res.ok) throw await failure('event insert failed', res, c.key);
}

export async function loadCounts(): Promise<{ event: string; visitors: number; total: number }[]> {
  const raw = config();
  if (!raw) throw new StoreConfigError('not configured');
  const c = checked(raw);
  const res = await request(`${c.url}/rest/v1/event_funnel?select=event,visitors,total`, {
    headers: headers(c.key),
    cache: 'no-store',
  });
  if (!res.ok) throw await failure('funnel query failed', res, c.key);
  const rows = (await res.json()) as { event: string; visitors: number | string; total: number | string }[];
  return rows.map((r) => ({ event: r.event, visitors: Number(r.visitors), total: Number(r.total) }));
}
