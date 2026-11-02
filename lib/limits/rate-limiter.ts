import type { BucketConfig } from "./bucket";
import { MemoryBucketStore, RateLimiter } from "./limiter";

// A token bucket for Companies House. Runs happen in the one tab that holds
// the vault, so the bucket lives in memory. Every Companies House call goes
// through acquire() before it's sent and report() after it returns.
// Browsers can't read Companies House's rate-limit headers (it doesn't expose
// them), so the bucket keeps its own count and backs off on a 429.

export { RateLimiter } from "./limiter";

// Companies House allows 600 requests per 5 minutes: 2 a second on average.
export const COMPANIES_HOUSE_LIMITS: BucketConfig = {
  ratePerSec: 2,
  capacity: 2,
  remainFloor: 2,
  fallbackBlockMs: 60_000,
};

let chLimiter: RateLimiter | undefined;

export function companiesHouseLimiter(): RateLimiter {
  chLimiter ??= new RateLimiter("companies_house", new MemoryBucketStore(), COMPANIES_HOUSE_LIMITS);
  return chLimiter;
}
