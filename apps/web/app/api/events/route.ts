import { NextResponse } from 'next/server';
import { parseEvent } from '@/lib/events';
import { saveEvent } from '@/lib/event-store';

// 측정 이벤트 수집. 잘못된 요청은 조용히 버리고, 저장 실패도 사용자에게 드러내지 않는다.
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 1000) return new NextResponse(null, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const e = parseEvent(raw);
  if (!e) return new NextResponse(null, { status: 400 });
  try {
    await saveEvent(e);
  } catch (err) {
    console.error('[events]', err instanceof Error ? err.message : err);
  }
  return new NextResponse(null, { status: 204 });
}
