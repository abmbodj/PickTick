import { Hono } from 'hono';

export { EventRoom } from './event-room';

const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
