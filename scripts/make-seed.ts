// Writes migrations/0002_seed.sql. Every name here is invented. Run: npm run seed
import { writeFileSync } from 'node:fs';
import { buildSeatMap } from '../shared/seat-map.ts';
import type { EventType } from '../shared/types.ts';

const seatMap = buildSeatMap;

const venues = [
  { id: 'coat-check', name: 'The Coat Check', city: 'Portland', map: seatMap([
    { name: 'Front', priceCents: 6000, rows: 2, perRow: 10 },
    { name: 'Back', priceCents: 4000, rows: 2, perRow: 10 } ]) },
  { id: 'halverson', name: 'Halverson Hall', city: 'Chicago', map: seatMap([
    { name: 'Floor', priceCents: 9500, rows: 4, perRow: 16 },
    { name: 'Mezzanine', priceCents: 6500, rows: 3, perRow: 16 },
    { name: 'Balcony', priceCents: 3500, rows: 3, perRow: 16 } ]) },
  { id: 'blue-lantern', name: 'Blue Lantern Room', city: 'New Orleans', map: seatMap([
    { name: 'Tables', priceCents: 5500, rows: 4, perRow: 12 },
    { name: 'Rail', priceCents: 3000, rows: 4, perRow: 12 } ]) },
  { id: 'tidewater', name: 'Tidewater Arena', city: 'Baltimore', map: seatMap([
    { name: 'Courtside', priceCents: 18000, rows: 2, perRow: 20 },
    { name: 'Lower', priceCents: 8000, rows: 4, perRow: 20 },
    { name: 'Upper', priceCents: 3200, rows: 4, perRow: 20 } ]) },
  { id: 'foundry-rink', name: 'Foundry Rink', city: 'Pittsburgh', map: seatMap([
    { name: 'Trackside', priceCents: 4500, rows: 3, perRow: 15 },
    { name: 'Bleachers', priceCents: 2200, rows: 5, perRow: 15 } ]) },
  { id: 'marigold', name: 'Marigold Playhouse', city: 'Minneapolis', map: seatMap([
    { name: 'Orchestra', priceCents: 7800, rows: 6, perRow: 14 },
    { name: 'Loge', priceCents: 4800, rows: 4, perRow: 14 } ]) },
  { id: 'cellar-door', name: 'The Cellar Door', city: 'Austin', map: seatMap([
    { name: 'Front', priceCents: 3800, rows: 3, perRow: 10 },
    { name: 'Bar', priceCents: 2500, rows: 5, perRow: 10 } ]) },
];

const performers = [
  { id: 'marrow-vine', name: 'Marrow & Vine', blurb: 'A two-piece that plays forty-seat rooms on purpose and sells every one of them out.' },
  { id: 'glasswing', name: 'Glasswing Arcade', blurb: 'Synth quartet from the Great Lakes with a light rig bigger than their van.' },
  { id: 'odile-brandt', name: 'Odile Brandt Trio', blurb: 'Piano, upright bass and brushes. Standards, played slowly.' },
  { id: 'herons', name: 'Harbor City Herons', blurb: 'Second in the Coastal Division and loud about it.' },
  { id: 'derby', name: 'Iron Lake Roller Derby', blurb: 'Flat-track league now in its eleventh season.' },
  { id: 'marigold-co', name: 'Marigold Repertory Company', blurb: 'A resident company of fourteen staging four productions a year.' },
  { id: 'dana-okafor', name: 'Dana Okafor', blurb: 'Stand-up about group chats, landlords and her mother\'s voicemails.' },
  { id: 'after-hours', name: 'After Hours Improv', blurb: 'Six improvisers, one audience suggestion, no script.' },
];

const events: { id: string; venue: string; performer: string; name: string; description: string; type: EventType; startsAt: string }[] = [
  { id: 'hot', venue: 'coat-check', performer: 'marrow-vine', type: 'concert', startsAt: '2027-02-12T20:00:00Z',
    name: 'Marrow & Vine: The Last Forty',
    description: 'One night, forty seats, no opener. The smallest show of the tour and the hardest ticket to get.' },
  { id: 'glasswing-night-signals', venue: 'halverson', performer: 'glasswing', type: 'concert', startsAt: '2027-03-06T19:30:00Z',
    name: 'Glasswing Arcade: Night Signals Tour',
    description: 'The full Night Signals album front to back, with the lasers the fire marshal approved.' },
  { id: 'odile-brandt-late-set', venue: 'blue-lantern', performer: 'odile-brandt', type: 'concert', startsAt: '2027-03-19T22:00:00Z',
    name: 'Odile Brandt Trio: The Late Set',
    description: 'A ten o\'clock jazz set at candle-lit tables. Two-drink minimum, zero talking during ballads.' },
  { id: 'herons-rooks', venue: 'tidewater', performer: 'herons', type: 'sports', startsAt: '2027-02-27T18:00:00Z',
    name: 'Harbor City Herons vs. Ridgeline Rooks',
    description: 'Division rivals meet for the third time this basketball season with the series tied at one apiece.' },
  { id: 'derby-finals', venue: 'foundry-rink', performer: 'derby', type: 'sports', startsAt: '2027-04-10T17:00:00Z',
    name: 'Iron Lake Roller Derby Finals',
    description: 'The Furnace Belles and the Slag Queens skate for the league trophy. Trackside seats are close enough to get sweated on.' },
  { id: 'clockmakers-daughter', venue: 'marigold', performer: 'marigold-co', type: 'theater', startsAt: '2027-03-12T19:00:00Z',
    name: 'The Clockmaker\'s Daughter',
    description: 'A new play about an inheritance, a workshop full of stopped clocks and the one that still runs.' },
  { id: 'history-of-rain', venue: 'marigold', performer: 'marigold-co', type: 'theater', startsAt: '2027-05-01T14:00:00Z',
    name: 'A Brief History of Rain',
    description: 'Three generations, one leaking roof. A matinee comedy-drama in two acts.' },
  { id: 'dana-okafor-reply-all', venue: 'cellar-door', performer: 'dana-okafor', type: 'comedy', startsAt: '2027-02-20T21:00:00Z',
    name: 'Dana Okafor: Reply All',
    description: 'A new hour of stand-up, recorded live. Phones go in a pouch at the door.' },
  { id: 'improv-after-hours', venue: 'cellar-door', performer: 'after-hours', type: 'comedy', startsAt: '2027-04-23T23:00:00Z',
    name: 'Improv After Hours',
    description: 'The late show. Whatever the audience shouts first becomes the next forty minutes.' },
];

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const lines: string[] = ['-- Generated by scripts/make-seed.ts. Do not edit by hand.'];
for (const v of venues)
  lines.push(`INSERT INTO venue (id, name, city, seat_map_json) VALUES (${q(v.id)}, ${q(v.name)}, ${q(v.city)}, ${q(JSON.stringify(v.map))});`);
for (const p of performers)
  lines.push(`INSERT INTO performer (id, name, blurb) VALUES (${q(p.id)}, ${q(p.name)}, ${q(p.blurb)});`);
for (const e of events) {
  const v = venues.find((x) => x.id === e.venue)!;
  const p = performers.find((x) => x.id === e.performer)!;
  lines.push(`INSERT INTO event (id, venue_id, performer_id, name, description, type, starts_at) VALUES (${q(e.id)}, ${q(v.id)}, ${q(p.id)}, ${q(e.name)}, ${q(e.description)}, ${q(e.type)}, ${q(e.startsAt)});`);
  lines.push(`INSERT INTO event_fts (event_id, name, description, performer, venue, city) VALUES (${q(e.id)}, ${q(e.name)}, ${q(e.description)}, ${q(p.name)}, ${q(v.name)}, ${q(v.city)});`);
}
writeFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), lines.join('\n') + '\n');
console.log(`wrote ${events.length} events, ${venues.length} venues`);
