// What every Pages Function gets from Cloudflare: the D1 database of accounts.
export type Env = { DB: D1Database };

export type Ctx = EventContext<Env, string, Record<string, unknown>>;
