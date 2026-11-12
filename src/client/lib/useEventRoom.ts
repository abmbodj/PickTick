import { useEffect, useReducer, useState } from 'react';
import type { RoomMessage } from '../../../shared/types';
import { applyHold, applyMessage, applyRelease, type RoomState } from './room';

type Action =
  | { t: 'message'; msg: RoomMessage; now: number }
  | { t: 'hold'; seatId: string; expiresAt: number }
  | { t: 'release'; seatIds: string[] }
  | { t: 'reset' };

function reducer(state: RoomState | null, a: Action): RoomState | null {
  if (a.t === 'reset') return null;
  if (a.t === 'message') return applyMessage(state, a.msg, a.now);
  if (!state) return state;
  if (a.t === 'hold') return applyHold(state, a.seatId, a.expiresAt);
  return a.seatIds.reduce(applyRelease, state);
}

// Live seat state for one event. Reconnects with backoff, and straight away
// when the tab becomes visible again (a phone waking up). Every reconnect
// starts from a fresh snapshot, so nothing stale survives a drop.
export function useEventRoom(eventId: string, enabled: boolean) {
  const [state, dispatch] = useReducer(reducer, null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Another event's seats must not linger while this one connects.
    dispatch({ t: 'reset' });
    setConnected(false);
    if (!enabled) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/events/${encodeURIComponent(eventId)}/live`;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let stopped = false;

    const connect = () => {
      clearTimeout(timer);
      const socket = new WebSocket(url);
      ws = socket;
      socket.onopen = () => {
        delay = 1000;
        setConnected(true);
      };
      socket.onmessage = (e) =>
        dispatch({ t: 'message', msg: JSON.parse(e.data as string) as RoomMessage, now: Date.now() });
      socket.onclose = () => {
        if (stopped || ws !== socket) return;
        setConnected(false);
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10_000);
      };
    };
    const onVisible = () => {
      // A socket can still read OPEN after a phone sleeps while being dead, so
      // always start a new one; its snapshot replaces whatever went stale.
      if (document.visibilityState !== 'visible' || ws?.readyState === WebSocket.CONNECTING) return;
      ws?.close();
      connect();
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      ws?.close();
    };
  }, [eventId, enabled]);

  return {
    state,
    connected,
    held: (seatId: string, expiresAt: number) => dispatch({ t: 'hold', seatId, expiresAt }),
    released: (seatIds: string[]) => dispatch({ t: 'release', seatIds }),
  };
}
