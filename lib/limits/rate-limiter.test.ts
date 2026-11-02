import { describe, expect, it } from "vitest";
import { applyResponse, parseRemain, parseReset, reserve, type BucketConfig } from "./bucket";
import { MemoryBucketStore, RateLimiter } from "./limiter";

const cfg: BucketConfig = { ratePerSec: 2, capacity: 2, remainFloor: 2, fallbackBlockMs: 60_000 };

describe("reserve", () => {
  it("lets a full bucket's tokens through at once, then spaces callers 500ms apart", () => {
    let state = undefined;
    const waits: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = reserve(state, 0, cfg);
      state = r.state;
      waits.push(r.waitMs);
    }
    expect(waits).toEqual([0, 0, 500, 1000]);
  });

  it("refills at two tokens a second, up to capacity", () => {
    let r = reserve(undefined, 0, cfg);
    r = reserve(r.state, 0, cfg);
    expect(reserve(r.state, 500, cfg).waitMs).toBe(0);
    expect(reserve(r.state, 10_000, cfg).state.tokens).toBe(1);
  });
});

describe("applyResponse", () => {
  const full = { tokens: 2, updatedAt: 0, blockedUntil: 0 };

  it("blocks until the reset time on a 429", () => {
    const s = applyResponse(full, 0, { status: 429, resetAt: 30_000 }, cfg);
    expect(s.blockedUntil).toBe(30_000);
    expect(reserve(s, 1_000, cfg).waitMs).toBe(29_000 + 500);
  });

  it("falls back to a fixed backoff on a 429 with no reset header", () => {
    expect(applyResponse(full, 5_000, { status: 429 }, cfg).blockedUntil).toBe(65_000);
  });

  it("blocks when Companies House says the window is nearly spent", () => {
    expect(applyResponse(full, 0, { status: 200, remain: 1, resetAt: 90_000 }, cfg).blockedUntil).toBe(90_000);
  });

  it("leaves the bucket alone when plenty remain", () => {
    expect(applyResponse(full, 0, { status: 200, remain: 420, resetAt: 90_000 }, cfg)).toEqual(full);
  });

  it("never shortens a block already in place", () => {
    const blocked = applyResponse(full, 0, { status: 429, resetAt: 90_000 }, cfg);
    expect(applyResponse(blocked, 1_000, { status: 429, resetAt: 40_000 }, cfg).blockedUntil).toBe(90_000);
  });
});

describe("header parsing", () => {
  it("reads epoch seconds and relative seconds for the reset", () => {
    expect(parseReset("1792415300", 0)).toBe(1_792_415_300_000);
    expect(parseReset("30", 1_000)).toBe(31_000);
    expect(parseReset(null, 0)).toBeUndefined();
    expect(parseReset("soon", 0)).toBeUndefined();
  });

  it("reads the remaining count", () => {
    expect(parseRemain("599")).toBe(599);
    expect(parseRemain("")).toBeUndefined();
    expect(parseRemain(null)).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  function setup() {
    let now = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter(
      "test",
      new MemoryBucketStore(),
      cfg,
      () => now,
      async (ms) => {
        slept.push(ms);
        now += ms;
      },
    );
    return { limiter, slept, advance: (ms: number) => (now += ms), now: () => now };
  }

  it("keeps sequential calls to two a second", async () => {
    const { limiter, slept, now } = setup();
    for (let i = 0; i < 6; i++) await limiter.acquire();
    expect(slept).toEqual([500, 500, 500, 500]);
    expect(now()).toBe(2_000);
  });

  it("waits out a 429 until the reset header", async () => {
    const { limiter, now } = setup();
    await limiter.acquire();
    const headers = new Headers({ "x-ratelimit-reset": "60" });
    limiter.report({ status: 429, headers });
    await limiter.acquire();
    expect(now()).toBeGreaterThanOrEqual(60_000);
  });
});
