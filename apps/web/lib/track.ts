// 브라우저에서 이벤트를 보낸다. 실패해도 화면 동작에는 영향을 주지 않는다.
import type { EventName } from './events';

const VISITOR_KEY = 'naite:visitor';
/** /stats 를 연 브라우저(운영자 본인)는 기록하지 않는다 */
export const NO_TRACK_KEY = 'naite:no-track';

function visitorId(): string | null {
  try {
    if (localStorage.getItem(NO_TRACK_KEY)) return null;
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null; // 저장소가 막힌 브라우저는 기록하지 않는다
  }
}

export function track(event: EventName): void {
  const id = visitorId();
  if (!id) return;
  const body = JSON.stringify({ visitorId: id, event, path: location.pathname });
  try {
    // 페이지를 떠나는 순간에도 전송되도록 sendBeacon 을 먼저 쓴다
    if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/events', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch {
    // 무시
  }
}
