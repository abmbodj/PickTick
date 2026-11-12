import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Tests never reach the network. A test that needs the Ticketmaster API stubs fetch itself.
globalThis.fetch = async () => {
  throw new Error('outbound fetch is blocked in tests');
};
