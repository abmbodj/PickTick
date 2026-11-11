import { DurableObject } from 'cloudflare:workers';
import {
  HOLD_MS,
  MAX_HOLDS,
  type Booking,
  type ConfirmResult,
  type HoldResult,
  type RoomMessage,
  type SeatView,
  type Snapshot,
  type Stats,
  type User,
} from '../../shared/types';
import { getEvent } from './catalog';

type Stat = keyof Stats;

// One instance per event. Owns that event's seats, holds, bookings and counters.
// A Durable Object runs one request at a time and its SQL calls are synchronous,
// so "check the seat, then take it" cannot interleave with another request.
// A hold whose expires_at has passed is treated as absent everywhere.
export class EventRoom extends DurableObject<Env> {
  private ready: Promise<boolean> | null = null;

  private get sql() {
    return this.ctx.storage.sql;
  }

  // Creates this event's tables and seats on first use. Returns false, and
  // writes nothing, when the event is not in the catalog.
  private ensureSeats(eventId: string): Promise<boolean> {
    // A missing event or a failed catalog read is not cached, so the next request retries.
    this.ready ??= this.init(eventId).then(
      (ok) => {
        if (!ok) this.ready = null;
        return ok;
      },
      (err) => {
        this.ready = null;
        throw err;
      },
    );
    return this.ready;
  }

  private async init(eventId: string): Promise<boolean> {
    const exists = this.sql
      .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'seat'")
      .toArray().length;
    if (exists) return true;
    const event = await getEvent(this.env.DB, eventId);
    if (!event) return false;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS seat (id TEXT PRIMARY KEY, price_cents INTEGER NOT NULL, booking_id TEXT);
        CREATE TABLE IF NOT EXISTS hold (seat_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nickname TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS booking (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nickname TEXT NOT NULL, total_cents INTEGER NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS stats (id INTEGER PRIMARY KEY CHECK (id = 1), granted INTEGER NOT NULL, rejected INTEGER NOT NULL, expired INTEGER NOT NULL, sold INTEGER NOT NULL);
        INSERT OR IGNORE INTO stats VALUES (1, 0, 0, 0, 0);
      `);
      for (const section of event.seatMap.sections)
        for (const row of section.rows)
          for (const seat of row.seats)
            this.sql.exec('INSERT OR IGNORE INTO seat (id, price_cents) VALUES (?, ?)', seat.id, section.priceCents);
    });
    return true;
  }

  private bump(stat: Stat, by = 1) {
    this.sql.exec(`UPDATE stats SET ${stat} = ${stat} + ? WHERE id = 1`, by);
  }

  private stats(): Stats {
    const { granted, rejected, expired, sold } = this.sql
      .exec<Stats>('SELECT granted, rejected, expired, sold FROM stats WHERE id = 1')
      .one();
    return { granted, rejected, expired, sold };
  }

  // Removes holds past their deadline and returns the seats they freed.
  private purgeExpired(now: number): string[] {
    const freed = this.sql
      .exec<{ seat_id: string }>('DELETE FROM hold WHERE expires_at <= ? RETURNING seat_id', now)
      .toArray()
      .map((r) => r.seat_id);
    if (freed.length) this.bump('expired', freed.length);
    return freed;
  }

  private seatViews(ids?: string[]): SeatView[] {
    const filter = ids ? `WHERE s.id IN (${ids.map(() => '?').join(',')})` : '';
    return this.sql
      .exec<{ id: string; price_cents: number; sold_by: string | null; held_by: string | null }>(
        `SELECT s.id, s.price_cents, b.nickname AS sold_by, h.nickname AS held_by
         FROM seat s
         LEFT JOIN booking b ON b.id = s.booking_id
         LEFT JOIN hold h ON h.seat_id = s.id
         ${filter} ORDER BY s.rowid`,
        ...(ids ?? []),
      )
      .toArray()
      .map((r) => ({
        id: r.id,
        priceCents: r.price_cents,
        status: r.sold_by !== null ? 'sold' : r.held_by !== null ? 'held' : 'available',
        by: r.sold_by ?? r.held_by,
      }));
  }

  private holdsOf(userId: string) {
    return this.sql
      .exec<{ seat_id: string; expires_at: number }>(
        'SELECT seat_id, expires_at FROM hold WHERE user_id = ? ORDER BY rowid',
        userId,
      )
      .toArray();
  }

  private bookingRow(bookingId: string) {
    const [row] = this.sql
      .exec<{ id: string; user_id: string; nickname: string; total_cents: number; created_at: number }>(
        'SELECT * FROM booking WHERE id = ?',
        bookingId,
      )
      .toArray();
    if (!row) return null;
    const seatIds = this.sql
      .exec<{ id: string }>('SELECT id FROM seat WHERE booking_id = ? ORDER BY rowid', bookingId)
      .toArray()
      .map((r) => r.id);
    const booking: Booking = {
      id: row.id,
      nickname: row.nickname,
      totalCents: row.total_cents,
      createdAt: row.created_at,
      seatIds,
    };
    return { userId: row.user_id, booking };
  }

  async snapshot(eventId: string, userId: string): Promise<Snapshot | null> {
    if (!(await this.ensureSeats(eventId))) return null;
    const now = Date.now();
    this.broadcast(this.purgeExpired(now));
    const mine = this.holdsOf(userId);
    return {
      seats: this.seatViews(),
      stats: this.stats(),
      mine: { seatIds: mine.map((h) => h.seat_id), expiresAt: mine[0]?.expires_at ?? null },
      now,
    };
  }

  async hold(eventId: string, user: User, seatId: string): Promise<HoldResult | null> {
    if (!(await this.ensureSeats(eventId))) return null;
    // No awaits below this line: the check and the write are one uninterrupted step.
    const now = Date.now();
    const freed = this.purgeExpired(now);
    const result = this.tryHold(user, seatId, now);
    // Rejections are broadcast too, so everyone sees the conflict counter move.
    this.broadcast([...freed, seatId]);
    if (result.ok) await this.armAlarm();
    return result;
  }

  private tryHold(user: User, seatId: string, now: number): HoldResult {
    const [seat] = this.sql
      .exec<{ booking_id: string | null }>('SELECT booking_id FROM seat WHERE id = ?', seatId)
      .toArray();
    if (!seat) return { ok: false, reason: 'unknown_seat' };

    const [holder] = this.sql
      .exec<{ user_id: string; expires_at: number }>(
        'SELECT user_id, expires_at FROM hold WHERE seat_id = ?',
        seatId,
      )
      .toArray();
    if (holder?.user_id === user.id) return { ok: true, expiresAt: holder.expires_at };
    if (seat.booking_id !== null || holder) {
      this.bump('rejected');
      return { ok: false, reason: 'taken' };
    }

    const mine = this.holdsOf(user.id);
    if (mine.length >= MAX_HOLDS) return { ok: false, reason: 'limit' };
    const expiresAt = mine[0]?.expires_at ?? now + HOLD_MS;
    this.sql.exec(
      'INSERT INTO hold (seat_id, user_id, nickname, expires_at) VALUES (?, ?, ?, ?)',
      seatId,
      user.id,
      user.nickname,
      expiresAt,
    );
    this.bump('granted');
    return { ok: true, expiresAt };
  }

  async release(eventId: string, userId: string, seatId: string): Promise<boolean> {
    if (!(await this.ensureSeats(eventId))) return false;
    const freed = this.purgeExpired(Date.now());
    const released =
      this.sql.exec('DELETE FROM hold WHERE seat_id = ? AND user_id = ?', seatId, userId).rowsWritten > 0;
    this.broadcast(released ? [...freed, seatId] : freed);
    await this.armAlarm();
    return released;
  }

  async confirm(eventId: string, user: User, bookingId: string): Promise<ConfirmResult | null> {
    if (!(await this.ensureSeats(eventId))) return null;
    const existing = this.bookingRow(bookingId);
    if (existing)
      return existing.userId === user.id
        ? { ok: true, booking: existing.booking }
        : { ok: false, reason: 'expired' };

    const now = Date.now();
    const freed = this.purgeExpired(now);
    const mine = this.holdsOf(user.id);
    if (mine.length === 0) {
      this.broadcast(freed);
      return { ok: false, reason: 'expired' };
    }

    this.ctx.storage.transactionSync(() => {
      const ids = mine.map((h) => h.seat_id);
      const marks = ids.map(() => '?').join(',');
      const { total } = this.sql
        .exec<{ total: number }>(`SELECT sum(price_cents) AS total FROM seat WHERE id IN (${marks})`, ...ids)
        .one();
      this.sql.exec(
        'INSERT INTO booking (id, user_id, nickname, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
        bookingId,
        user.id,
        user.nickname,
        total,
        now,
      );
      this.sql.exec(`UPDATE seat SET booking_id = ? WHERE id IN (${marks})`, bookingId, ...ids);
      this.sql.exec('DELETE FROM hold WHERE user_id = ?', user.id);
      this.bump('sold', ids.length);
    });
    this.broadcast([...freed, ...mine.map((h) => h.seat_id)]);
    await this.armAlarm();
    return { ok: true, booking: this.bookingRow(bookingId)!.booking };
  }

  async getBooking(eventId: string, userId: string, bookingId: string): Promise<Booking | null> {
    if (!(await this.ensureSeats(eventId))) return null;
    const row = this.bookingRow(bookingId);
    return row?.userId === userId ? row.booking : null;
  }

  // Demo reset. A room that was never used has nothing to clear.
  async reset(): Promise<void> {
    const exists = this.sql
      .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'seat'")
      .toArray().length;
    if (!exists) return;
    this.sql.exec(`
      DELETE FROM hold;
      UPDATE seat SET booking_id = NULL;
      DELETE FROM booking;
      UPDATE stats SET granted = 0, rejected = 0, expired = 0, sold = 0 WHERE id = 1;
    `);
    this.send({ type: 'seats', seats: this.seatViews(), stats: this.stats(), now: Date.now() });
    await this.armAlarm();
  }

  // ---- live updates ----

  private send(message: RoomMessage) {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // A socket that is already closing just misses this update.
      }
    }
  }

  private broadcast(seatIds: string[]) {
    if (seatIds.length === 0) return;
    this.send({
      type: 'seats',
      seats: this.seatViews([...new Set(seatIds)]),
      stats: this.stats(),
      now: Date.now(),
    });
  }

  // Wakes the room at the next deadline so expired seats are pushed to viewers.
  // Correctness never depends on this: an expired hold is already ignored.
  private async armAlarm() {
    const { next } = this.sql
      .exec<{ next: number | null }>('SELECT min(expires_at) AS next FROM hold')
      .one();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    this.broadcast(this.purgeExpired(Date.now()));
    await this.armAlarm();
  }

  // WebSocket upgrade, forwarded by the Worker with the caller's id attached.
  async fetch(request: Request): Promise<Response> {
    const eventId = request.headers.get('x-event-id') ?? '';
    const userId = request.headers.get('x-uid') ?? '';
    const snapshot = await this.snapshot(eventId, userId);
    if (!snapshot) return Response.json({ error: 'Event not found' }, { status: 404 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: 'snapshot', ...snapshot } satisfies RoomMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws: WebSocket) {
    ws.close();
  }
}
