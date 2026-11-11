// Fires N simultaneous holds at one seat, each as a different visitor.
// Usage: npm run contention -- <baseUrl> [eventId=hot] [seatId=Front-1-1] [n=50]
// Expected: "200: 1, 409: N-1". Reset first if the seat is already taken.
const [base = 'http://localhost:5173', eventId = 'hot', seatId = 'Front-1-1', count = '50'] =
  process.argv.slice(2);
const n = Number(count);

const cookies = await Promise.all(
  Array.from({ length: n }, async () => {
    const res = await fetch(`${base}/api/health`);
    return res.headers.get('set-cookie')!.split(';')[0];
  }),
);

const statuses = await Promise.all(
  cookies.map(async (cookie, i) => {
    const res = await fetch(`${base}/api/events/${eventId}/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ seatId, nickname: `bot-${i + 1}` }),
    });
    return res.status;
  }),
);

const tally = new Map<number, number>();
for (const s of statuses) tally.set(s, (tally.get(s) ?? 0) + 1);
console.log([...tally].sort(([a], [b]) => a - b).map(([s, c]) => `${s}: ${c}`).join(', '));
