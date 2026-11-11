import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Anonymous identity: an unguessable id in an HttpOnly cookie. No accounts.
export const identity = createMiddleware<{ Bindings: Env; Variables: { uid: string } }>(
  async (c, next) => {
    let uid = getCookie(c, 'uid');
    if (!uid || !UUID.test(uid)) {
      uid = crypto.randomUUID();
      setCookie(c, 'uid', uid, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    c.set('uid', uid);
    await next();
  },
);
