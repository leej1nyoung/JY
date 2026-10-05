// 측정 이벤트 정의 (CLAUDE.md 5-7). 클라이언트와 서버가 함께 쓴다.
// 개인정보는 담지 않는다: 무작위 방문 번호, 이벤트 이름, 경로, 시각만 기록한다.

/** 퍼널 순서대로. 결제 완료·답장 작성은 4·5단계에서 추가한다. */
export const FUNNEL = [
  { event: 'main_view', label: '메인 진입' },
  { event: 'write_view', label: '입력 화면 진입' },
  { event: 'letter_created', label: '입력 완료 (편지 받음)' },
  { event: 'letter_read_end', label: '첫 장 끝까지 읽음' },
  { event: 'pay_click', label: '결제 버튼 클릭' },
  { event: 'second_page_view', label: '두 번째 장 열람 (테스트 무료)' },
] as const;

/** 지인 테스트: 두 번째 장을 다 읽은 뒤 "990원 낼 만했어?" 답 */
export const WORTH = [
  { event: 'worth_yes', label: '응, 낼 만했어' },
  { event: 'worth_unsure', label: '잘 모르겠어' },
  { event: 'worth_no', label: '아니' },
] as const;

export type EventName = (typeof FUNNEL)[number]['event'] | (typeof WORTH)[number]['event'];

const NAMES = new Set<string>([...FUNNEL, ...WORTH].map((s) => s.event));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface TrackedEvent {
  visitorId: string;
  event: EventName;
  path: string;
}

/** 클라이언트에서 온 값을 검사한다. 맞지 않으면 null */
export function parseEvent(raw: unknown): TrackedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.visitorId !== 'string' || !UUID.test(r.visitorId)) return null;
  if (typeof r.event !== 'string' || !NAMES.has(r.event)) return null;
  const path = typeof r.path === 'string' && r.path.startsWith('/') ? r.path.slice(0, 100) : '/';
  return { visitorId: r.visitorId, event: r.event as EventName, path };
}

export interface FunnelRow {
  event: EventName;
  label: string;
  visitors: number;
  total: number;
  /** 바로 앞 단계 대비 (%) */
  fromPrev: number | null;
  /** 첫 단계 대비 (%) */
  fromFirst: number | null;
}

/** 이벤트별 집계(방문자 수·횟수) → 퍼널 표 */
export function buildFunnel(counts: { event: string; visitors: number; total: number }[]): FunnelRow[] {
  const by = new Map(counts.map((c) => [c.event, c]));
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const first = by.get(FUNNEL[0].event)?.visitors ?? 0;
  let prev: number | null = null;
  return FUNNEL.map((s) => {
    const visitors = by.get(s.event)?.visitors ?? 0;
    const row: FunnelRow = {
      event: s.event,
      label: s.label,
      visitors,
      total: by.get(s.event)?.total ?? 0,
      fromPrev: prev === null ? null : pct(visitors, prev),
      fromFirst: prev === null ? null : pct(visitors, first),
    };
    prev = visitors;
    return row;
  });
}
