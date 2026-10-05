'use server';

import { createFirstLetter, createSecondPageContext, type FirstLetterRequest, type FirstLetterResponse, type SecondPage } from '@naite/letter';
import { SecondPageError, generateSecondPage, isSecondPageEnabled } from '@/lib/second-page-ai';

// 입력값은 계산에만 쓰고 저장·로그하지 않는다 (CLAUDE.md 6: 미결제자 정보는 보관하지 않음).
// 클라이언트에서 온 값은 신뢰하지 않고 형태를 다시 확인한다.
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);
const bool = (v: unknown) => v === true;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function parseRequest(raw: unknown): FirstLetterRequest {
  const r = (raw ?? {}) as Record<string, unknown>;
  const time = r.time as Record<string, unknown> | null | undefined;
  const req: FirstLetterRequest = {
    calendar: r.calendar === 'lunar' ? 'lunar' : 'solar',
    year: int(r.year),
    month: int(r.month),
    day: int(r.day),
    isLeapMonth: bool(r.isLeapMonth),
    time: time ? { hour: int(time.hour), minute: int(time.minute) } : null,
    birthplaceCode: str(r.birthplaceCode, 10),
    mbti: str(r.mbti, 4),
    name: str(r.name, 40) || null,
    birthdayBasis: r.birthdayBasis === 'lunar' ? 'lunar' : 'solar',
    confirmSelf: bool(r.confirmSelf),
    confirmAge: bool(r.confirmAge),
  };
  return req;
}

/** 성공하면 첫 장을 만든 시각도 돌려준다. 두 번째 장은 이 시각으로 첫 장을 똑같이 다시 계산한다 */
export type FirstLetterResult =
  | (Extract<FirstLetterResponse, { ok: true }> & { createdAt: string })
  | Extract<FirstLetterResponse, { ok: false }>;

export async function requestFirstLetter(raw: unknown): Promise<FirstLetterResult> {
  const req = parseRequest(raw);
  const now = new Date();
  try {
    const res = createFirstLetter(req, now);
    return res.ok ? { ...res, createdAt: now.toISOString() } : res;
  } catch {
    return { ok: false, field: 'birth', message: '편지를 만드는 중에 문제가 생겼어요. 입력을 확인하고 다시 시도해 주세요.' };
  }
}

export type SecondPageResponse = { ok: true; page: SecondPage } | { ok: false; message: string };

const HOUR = 3_600_000;
/** 지인 테스트용 안전장치: 서버 한 대당 시간당 생성 횟수 상한 (사용량 한도는 Anthropic 콘솔에서도 건다) */
const HOURLY_LIMIT = 40;
let windowStart = 0;
let windowCount = 0;

/**
 * 지인 테스트 기간: 결제 버튼을 누른 사람에게 두 번째 장을 무료로 열어 준다 (SECOND_PAGE_FREE=on 일 때만).
 * 입력값과 첫 장을 만든 시각만 받아 서버에서 첫 장을 다시 계산하고, 그 재료로 AI 가 두 번째 장을 쓴다.
 * 입력값과 결과는 저장하지 않는다 (결과는 그 사람 브라우저에만 남는다).
 */
export async function requestSecondPage(raw: unknown, createdAtIso: unknown): Promise<SecondPageResponse> {
  const fail = (message: string): SecondPageResponse => ({ ok: false, message });
  if (!isSecondPageEnabled()) return fail('두 번째 장은 아직 열 수 없어요.');

  const createdAt = new Date(typeof createdAtIso === 'string' ? createdAtIso : NaN);
  const age = Date.now() - createdAt.getTime();
  if (!Number.isFinite(age) || age < -5 * 60_000 || age > 48 * HOUR) {
    return fail('편지를 받은 지 오래돼서 다시 열 수 없어요. 처음부터 다시 받아 주세요.');
  }

  const now = Date.now();
  if (now - windowStart > HOUR) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= HOURLY_LIMIT) return fail('지금 여는 사람이 많아요. 잠시 뒤에 다시 시도해 주세요.');
  windowCount++;

  try {
    const ctx = createSecondPageContext(parseRequest(raw), createdAt);
    if (!ctx.ok) return fail(ctx.message);
    return { ok: true, page: await generateSecondPage(ctx.context) };
  } catch (e) {
    // 원인을 Vercel 로그에서 볼 수 있게 남긴다 (API 오류는 상태 코드와 이름만, 입력값은 남기지 않는다)
    const detail = e instanceof SecondPageError ? e.message : e instanceof Error ? `${e.name}${'status' in e ? ` ${String((e as { status?: unknown }).status)}` : ''}` : 'unknown';
    console.error('[second-page] failed:', detail);
    return fail('두 번째 장을 쓰다가 문제가 생겼어요. 잠시 뒤에 다시 열어 주세요.');
  }
}

