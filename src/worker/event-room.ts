import { DurableObject } from 'cloudflare:workers';

export class EventRoom extends DurableObject<Env> {}
