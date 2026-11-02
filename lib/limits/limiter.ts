import {
  applyResponse,
  parseRemain,
  parseReset,
  reserve,
  type BucketConfig,
  type BucketState,
} from "./bucket";

// Waits for a token before each request and feeds each response's rate-limit
// headers back into the bucket. Storage is pluggable: memory in tests, SQLite
// in the app (lib/limits/rate-limiter.ts).

export interface BucketStore {
  /** Reads, changes and writes one bucket atomically across processes. */
  update<T>(key: string, fn: (state: BucketState | undefined) => { state: BucketState; result: T }): T;
  read(key: string): BucketState | undefined;
}

type Clock = () => number;
type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  constructor(
    private readonly key: string,
    private readonly store: BucketStore,
    private readonly cfg: BucketConfig,
    private readonly clock: Clock = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const waitMs = this.store.update(this.key, (s) => {
        const r = reserve(s, this.clock(), this.cfg);
        return { state: r.state, result: r.waitMs };
      });
      if (waitMs > 0) await this.sleep(waitMs);
      // Someone may have hit a 429 while this caller slept.
      const blockedUntil = this.store.read(this.key)?.blockedUntil ?? 0;
      if (blockedUntil <= this.clock()) return;
    }
  }

  report(response: { status: number; headers: Headers }): void {
    const now = this.clock();
    const info = {
      status: response.status,
      remain: parseRemain(response.headers.get("x-ratelimit-remain")),
      resetAt: parseReset(response.headers.get("x-ratelimit-reset"), now),
    };
    this.store.update(this.key, (s) => ({ state: applyResponse(s, now, info, this.cfg), result: null }));
  }

  blockedUntil(): number {
    return this.store.read(this.key)?.blockedUntil ?? 0;
  }
}

export class MemoryBucketStore implements BucketStore {
  private buckets = new Map<string, BucketState>();
  update<T>(key: string, fn: (state: BucketState | undefined) => { state: BucketState; result: T }): T {
    const { state, result } = fn(this.buckets.get(key));
    this.buckets.set(key, state);
    return result;
  }
  read(key: string) {
    return this.buckets.get(key);
  }
}
