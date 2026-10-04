'use client';

import { useEffect } from 'react';
import type { EventName } from '@/lib/events';
import { track } from '@/lib/track';

/** 화면에 들어왔을 때 한 번 기록한다 */
export function TrackView({ event }: { event: EventName }) {
  useEffect(() => {
    track(event);
  }, [event]);
  return null;
}
