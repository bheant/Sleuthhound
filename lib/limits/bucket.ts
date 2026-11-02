// Pure token-bucket arithmetic for the shared rate limiter. No I/O here, so it
// can be unit tested; lib/limits/rate-limiter.ts stores the state and sleeps.

export type BucketConfig = {
  ratePerSec: number;
  capacity: number;
  /** Stop when the API says this many or fewer requests remain in its window. */
  remainFloor: number;
  /** How long to back off after a 429 that carries no reset time. */
  fallbackBlockMs: number;
};

export type BucketState = {
  tokens: number;
  /** The bucket's clock in epoch ms. In the future while blocked. */
  updatedAt: number;
  blockedUntil: number;
};

export type ResponseInfo = {
  status: number;
  remain?: number;
  /** Epoch ms when the API's window resets. */
  resetAt?: number;
};

export function fullBucket(now: number, cfg: BucketConfig): BucketState {
  return { tokens: cfg.capacity, updatedAt: now, blockedUntil: 0 };
}

function refill(state: BucketState, now: number, cfg: BucketConfig): BucketState {
  if (now <= state.updatedAt) return state;
  const tokens = Math.min(cfg.capacity, state.tokens + ((now - state.updatedAt) / 1000) * cfg.ratePerSec);
  return { ...state, tokens, updatedAt: now };
}

// Takes one token. A negative balance is a queue of reservations, so callers
// arriving together are spread out at the bucket's rate rather than bursting.
export function reserve(
  state: BucketState | undefined,
  now: number,
  cfg: BucketConfig,
): { state: BucketState; waitMs: number } {
  const next = refill(state ?? fullBucket(now, cfg), now, cfg);
  const tokens = next.tokens - 1;
  const queueMs = tokens < 0 ? (-tokens / cfg.ratePerSec) * 1000 : 0;
  const waitMs = Math.max(0, next.updatedAt - now) + queueMs;
  return { state: { ...next, tokens }, waitMs: Math.ceil(waitMs) };
}

// Empties the bucket and starts it again at `until`. Callers already waiting
// re-check blockedUntil when they wake and queue again behind it.
export function block(state: BucketState, until: number): BucketState {
  if (until <= state.blockedUntil) return state;
  return { tokens: 0, updatedAt: Math.max(state.updatedAt, until), blockedUntil: until };
}

export function applyResponse(
  state: BucketState | undefined,
  now: number,
  info: ResponseInfo,
  cfg: BucketConfig,
): BucketState {
  const current = state ?? fullBucket(now, cfg);
  const resetAt = info.resetAt && info.resetAt > now ? info.resetAt : undefined;
  if (info.status === 429) return block(current, resetAt ?? now + cfg.fallbackBlockMs);
  if (info.remain !== undefined && info.remain <= cfg.remainFloor && resetAt) {
    return block(current, resetAt);
  }
  return current;
}

// X-Ratelimit-Reset is epoch seconds; tolerate a seconds-from-now value too.
export function parseReset(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n > 1e9 ? n * 1000 : now + n * 1000;
}

export function parseRemain(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
