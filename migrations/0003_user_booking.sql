-- Read model for "My tickets". The event's Durable Object stays the source of truth.
CREATE TABLE user_booking (
  booking_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  city TEXT NOT NULL,
  image_url TEXT,
  seat_ids_json TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX user_booking_user ON user_booking (user_id, starts_at);
