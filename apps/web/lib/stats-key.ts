// 운영자 전용 페이지(/stats, /eval) 비밀 키 확인 (서버 전용)
import 'server-only';
import { timingSafeEqual } from 'node:crypto';

export function keyMatches(given: unknown): boolean {
  const expected = process.env.STATS_KEY;
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
