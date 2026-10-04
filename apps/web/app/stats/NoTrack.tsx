'use client';

import { useEffect, useState } from 'react';
import { NO_TRACK_KEY } from '@/lib/track';

/** 이 페이지를 연 브라우저는 앞으로 기록에서 뺀다 (운영자 본인 방문 제외) */
export function NoTrack() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(NO_TRACK_KEY, '1');
      setDone(true);
    } catch {
      // 저장소가 막힌 브라우저는 원래 기록되지 않는다
    }
  }, []);
  return done ? <p className="hint">이 브라우저에서의 방문은 이제 기록하지 않아요.</p> : null;
}
