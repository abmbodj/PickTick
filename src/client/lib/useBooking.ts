import { useEffect, useRef, useState } from 'react';
import { MAX_HOLDS, type Booking } from '../../../shared/types';
import { ApiError, holdSeat, payForHolds, releaseSeat } from './api';
import { msLeft } from './room';
import { useEventRoom } from './useEventRoom';

const NAME_KEY = 'picktick.nickname';
export type Notice = { kind: 'error' | 'info'; text: string };

const EXPIRED: Notice = {
  kind: 'error',
  text: 'Your hold ran out, so those seats are back on sale. Pick again.',
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// Everything between tapping a seat and holding a booking, for one event: the
// live room, my holds and their countdown, and the messages that go with them.
// `guest` lets a first tap hold the seat before a name has been given;
// otherwise `onNeedName` is called and the tap waits for one.
export function useBooking(
  eventId: string,
  enabled: boolean,
  opts: { guest?: boolean; onNeedName?: () => void } = {},
) {
  const room = useEventRoom(eventId, enabled);
  const [nickname, setNick] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // One id per checkout, so a double tap on Reserve cannot create two bookings.
  const bookingId = useRef(crypto.randomUUID());

  const mine = room.state?.mine.seatIds ?? [];
  const now = useNow(mine.length > 0);
  const left = room.state ? msLeft(room.state, now) : null;
  const name = nickname.trim();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // The hold can run out two ways: this device's countdown reaches zero, or the
  // server takes the seats back first. Either way, say what happened.
  useEffect(() => {
    if (left !== 0 || mine.length === 0) return;
    room.released(mine);
    setNotice(EXPIRED);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const expiredAt = room.state?.expiredAt ?? null;
  useEffect(() => {
    if (expiredAt !== null) setNotice(EXPIRED);
  }, [expiredAt]);

  async function release(seatId: string) {
    setBusy(seatId);
    try {
      await releaseSeat(eventId, seatId);
    } catch {
      // Already expired or released: the seat is free either way.
    } finally {
      room.released([seatId]);
      setBusy(null);
    }
  }

  async function onSeat(seatId: string) {
    if (busy) return;
    if (!room.state) {
      setNotice({ kind: 'info', text: 'Still connecting to the live seat map. Try again in a moment.' });
      return;
    }
    if (mine.includes(seatId)) return release(seatId);
    if (!name && !opts.guest) {
      opts.onNeedName?.();
      setNotice({ kind: 'info', text: 'Add your name first, so the room can see who holds the seat.' });
      return;
    }
    setBusy(seatId);
    try {
      const { expiresAt } = await holdSeat(eventId, seatId, name || 'Guest');
      room.held(seatId, expiresAt);
      setNotice(null);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setNotice({
        kind: 'error',
        text:
          status === 409
            ? 'Someone got that seat first. Try another.'
            : status === 422
              ? `You can hold up to ${MAX_HOLDS} seats. Release one to pick another.`
              : err instanceof Error
                ? err.message
                : 'That did not work. Try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  // Resolves to the booking, or null after saying why it did not go through.
  async function pay(): Promise<Booking | null> {
    setPaying(true);
    try {
      const booking = await payForHolds(eventId, bookingId.current, name || 'Guest');
      bookingId.current = crypto.randomUUID();
      return booking;
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'The reservation did not go through. Try again.',
      });
      return null;
    } finally {
      setPaying(false);
    }
  }

  return {
    room,
    mine,
    left,
    notice,
    busy,
    paying,
    nickname,
    setNickname: (value: string) => {
      setNick(value);
      localStorage.setItem(NAME_KEY, value);
    },
    heldSeats: mine.map((id) => ({ id, priceCents: room.state?.seats[id]?.priceCents ?? 0 })),
    onSeat,
    release,
    pay,
  };
}
