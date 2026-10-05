import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { loadCounts } = await import('../lib/event-store');

const SECRET = 'sb_secret_THIS_MUST_NEVER_BE_SHOWN';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function messageOf(): Promise<string> {
  try {
    await loadCounts();
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('설정 오류 안내는 환경변수 값을 드러내지 않는다', () => {
  it('URL 칸에 키를 넣은 경우', async () => {
    vi.stubEnv('SUPABASE_URL', SECRET);
    vi.stubEnv('SUPABASE_SECRET_KEY', SECRET);
    const m = await messageOf();
    expect(m).toContain('SUPABASE_URL 칸에 주소가 아니라 키');
    expect(m).not.toContain(SECRET);
  });
  it('키 칸에 주소를 넣은 경우', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://abcdefgh.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'https://abcdefgh.supabase.co');
    expect(await messageOf()).toContain('SUPABASE_SECRET_KEY 칸에 키가 아니라 주소');
  });
  it('연결 실패 메시지에 요청 주소·키가 섞이지 않는다', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://abcdefgh.supabase.co/rest/v1/');
    vi.stubEnv('SUPABASE_SECRET_KEY', SECRET);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError(`failed ${SECRET}`)));
    const m = await messageOf();
    expect(m).toContain('연결하지 못했어요');
    expect(m).not.toContain(SECRET);
  });
  it('권한 오류는 상태·원인·키 종류만', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://abcdefgh.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', SECRET);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'permission denied for view event_funnel' }), { status: 403 }));
    const m = await messageOf();
    expect(m).toBe('funnel query failed: 403 permission denied for view event_funnel (키 종류: secret)');
  });
});
