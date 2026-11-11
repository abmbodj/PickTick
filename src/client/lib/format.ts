const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents: number) => usd.format(cents / 100).replace(/\.00$/, '');

// Times are stored as the venue's wall-clock time, so they are shown as written.
const day = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
export const eventDay = (iso: string) => day.format(new Date(iso));
export const eventTime = (iso: string) => time.format(new Date(iso));
export const monthAbbrev = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(new Date(iso));
export const dayOfMonth = (iso: string) => new Date(iso).getUTCDate();

// Seat ids look like "Front-1-3": section, row, seat number.
export function seatLabel(id: string): string {
  const parts = id.split('-');
  const number = parts.pop();
  const row = parts.pop();
  return `${parts.join('-')}, row ${row}, seat ${number}`;
}

export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
