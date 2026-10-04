'use server';

import { createFirstLetter, type FirstLetterRequest, type FirstLetterResponse } from '@naite/letter';

// 입력값은 계산에만 쓰고 저장·로그하지 않는다 (CLAUDE.md 6: 미결제자 정보는 보관하지 않음).
// 클라이언트에서 온 값은 신뢰하지 않고 형태를 다시 확인한다.
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);
const bool = (v: unknown) => v === true;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function requestFirstLetter(raw: unknown): Promise<FirstLetterResponse> {
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
  try {
    return createFirstLetter(req);
  } catch {
    return { ok: false, field: 'birth', message: '편지를 만드는 중에 문제가 생겼어요. 입력을 확인하고 다시 시도해 주세요.' };
  }
}
