import { Hono } from 'hono';
import { z } from 'zod';
import { EVENT_TYPES } from '../../shared/types';
import { getEvent, searchEvents } from './catalog';

export { EventRoom } from './event-room';

const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

app.get('/api/health', (c) => c.json({ ok: true }));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const searchQuery = z.object({
  q: z.string().max(100).optional(),
  type: z.enum(EVENT_TYPES).optional(),
  from: day.optional(),
  to: day.optional(),
});

app.get('/api/events/search', async (c) => {
  const parsed = searchQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Invalid search parameters' }, 400);
  return c.json(await searchEvents(c.env.DB, parsed.data));
});

app.get('/api/events/:id', async (c) => {
  const event = await getEvent(c.env.DB, c.req.param('id'));
  return event ? c.json(event) : c.json({ error: 'Event not found' }, 404);
});

export default app;
