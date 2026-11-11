import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { EventType } from '../../../shared/types';

export const venue = sqliteTable('venue', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  seatMapJson: text('seat_map_json').notNull(),
});

export const performer = sqliteTable('performer', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  blurb: text('blurb').notNull(),
});

export const event = sqliteTable('event', {
  id: text('id').primaryKey(),
  venueId: text('venue_id').notNull().references(() => venue.id),
  performerId: text('performer_id').notNull().references(() => performer.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type').$type<EventType>().notNull(),
  startsAt: text('starts_at').notNull(),
});
