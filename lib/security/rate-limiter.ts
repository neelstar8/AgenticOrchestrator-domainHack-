import "server-only";

/**
 * Token-bucket rate limiting and bounded concurrency for outbound requests.
 *
 * Two separate concerns, both needed:
 *
 *  - Politeness and legality. Sentinel must not hammer a third-party host.
 *    The per-host bucket caps requests per minute for each hostname
 *    independently, so one slow host cannot consume another's budget.
 *  - Resource safety. A semaphore caps total simultaneous outbound requests,
 *    so a scan over 200 candidates cannot open 200 sockets.
 *
 * In-process only. A multi-instance deployment needs a shared store (Redis);
 * see docs/security-checklist.md.
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until a token is expected to be available. */
  retryAfterMs: number;
  remaining: number;
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
  ) {
    if (capacity <= 0) throw new Error("Rate limiter capacity must be positive.");
    if (refillPerMinute <= 0) throw new Error("Rate limiter refill rate must be positive.");
  }

  private refill(bucket: Bucket, now: number): void {
    const elapsedMs = now - bucket.lastRefillMs;
    if (elapsedMs <= 0) return;
    const tokensToAdd = (elapsedMs / 60_000) * this.refillPerMinute;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefillMs = now;
  }

  /** Consumes one token for `key` if available. */
  tryConsume(key: string, now = Date.now()): RateLimitDecision {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    }
    this.refill(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(bucket.tokens) };
    }

    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerMinute) * 60_000);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  /** Drops buckets that have refilled completely, so the map cannot grow forever. */
  prune(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      this.refill(bucket, now);
      if (bucket.tokens >= this.capacity) this.buckets.delete(key);
    }
  }

  reset(): void {
    this.buckets.clear();
  }
}

/** Caps simultaneous operations. */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (limit <= 0) throw new Error("Semaphore limit must be positive.");
  }

  get activeCount(): number {
    return this.active;
  }

  get queueLength(): number {
    return this.waiting.length;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw signal.reason ?? new Error("Aborted while queued.");

    if (this.active < this.limit) {
      this.active += 1;
      return this.createRelease();
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiting.indexOf(grant);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal?.reason ?? new Error("Aborted while queued."));
      };
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      this.waiting.push(grant);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

    this.active += 1;
    return this.createRelease();
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const next = this.waiting.shift();
      next?.();
    };
  }

  /** Runs `task` while holding a slot. */
  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await task();
    } finally {
      release();
    }
  }
}

const GLOBAL_KEY = "__sentinelRateLimiters__";
type GlobalWithLimiters = typeof globalThis & {
  [GLOBAL_KEY]?: { hostLimiter: TokenBucketRateLimiter; semaphore: Semaphore; signature: string };
};

/** Process-wide limiter pair, so limits are not reset by a hot reload. */
export function getOutboundLimiters(
  perHostPerMinute: number,
  maxConcurrent: number,
): { hostLimiter: TokenBucketRateLimiter; semaphore: Semaphore } {
  const signature = `${perHostPerMinute}:${maxConcurrent}`;
  const scope = globalThis as GlobalWithLimiters;

  if (scope[GLOBAL_KEY]?.signature === signature) {
    return { hostLimiter: scope[GLOBAL_KEY].hostLimiter, semaphore: scope[GLOBAL_KEY].semaphore };
  }

  const hostLimiter = new TokenBucketRateLimiter(perHostPerMinute, perHostPerMinute);
  const semaphore = new Semaphore(maxConcurrent);
  scope[GLOBAL_KEY] = { hostLimiter, semaphore, signature };
  return { hostLimiter, semaphore };
}
