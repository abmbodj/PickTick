CREATE TABLE venue (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  seat_map_json TEXT NOT NULL
);

CREATE TABLE performer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL
);

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venue (id),
  performer_id TEXT NOT NULL REFERENCES performer (id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('concert', 'sports', 'theater', 'comedy')),
  starts_at TEXT NOT NULL
);

CREATE INDEX event_starts_at ON event (starts_at);

CREATE VIRTUAL TABLE event_fts USING fts5 (
  event_id UNINDEXED, name, description, performer, venue, city,
  tokenize = 'porter unicode61'
);
