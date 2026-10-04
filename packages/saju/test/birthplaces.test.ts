import { describe, expect, it } from 'vitest';
import { BIRTHPLACES } from '../src/index.ts';

describe('출생지 데이터', () => {
  it('코드가 겹치지 않는다', () => {
    expect(new Set(BIRTHPLACES.map((b) => b.code)).size).toBe(BIRTHPLACES.length);
  });
  it('모든 좌표가 대한민국 범위 안 (동경 124~132°, 북위 33~39°)', () => {
    for (const b of BIRTHPLACES) {
      expect(b.longitude, b.name).toBeGreaterThan(124);
      expect(b.longitude, b.name).toBeLessThan(132);
      expect(b.latitude, b.name).toBeGreaterThan(33);
      expect(b.latitude, b.name).toBeLessThan(39);
    }
  });
  it('17개 시·도 모두 포함', () => {
    expect(new Set(BIRTHPLACES.map((b) => b.sido)).size).toBe(17);
  });
  it('안동시: 동경 128.7~128.9° (시청 128.73°, 면적 중심 128.78°)', () => {
    const andong = BIRTHPLACES.find((b) => b.code === '47170')!;
    expect(andong.name).toBe('안동시');
    expect(andong.longitude).toBeGreaterThan(128.7);
    expect(andong.longitude).toBeLessThan(128.9);
  });
});
