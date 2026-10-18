/**
 * Deterministic pseudo-randomness and id generation.
 *
 * The demo dataset and the simulated agents must produce the SAME output on
 * every machine and every run, so that a reviewer comparing two screenshots or
 * two test runs sees identical data. Nothing here is cryptographically secure
 * and nothing here is used for sessions, tokens or passwords — see
 * lib/auth/password.ts and lib/auth/session.ts for those.
 */

/** Fixed reference instant for the demo dataset. All fixture dates derive from it. */
export const DEMO_BASE_INSTANT = new Date("2026-10-17T09:00:00.000Z");

/** 32-bit FNV-1a hash of a string. Stable across platforms. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * mulberry32 PRNG. Small, fast, and identical in every JS engine.
 */
export function createRandom(seed: string | number): () => number {
  let state = (typeof seed === "number" ? seed : hashString(seed)) >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRandom {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  pickMany<T>(items: readonly T[], count: number): T[];
  bool(probability?: number): boolean;
  /** Minutes offset helper used to spread fixture timestamps. */
  offsetMinutes(min: number, max: number): number;
}

export function seededRandom(seed: string | number): SeededRandom {
  const next = createRandom(seed);
  const int = (minInclusive: number, maxInclusive: number): number => {
    if (maxInclusive < minInclusive) return minInclusive;
    return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
  };
  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("seededRandom.pick called with an empty list");
      return items[int(0, items.length - 1)] as T;
    },
    pickMany<T>(items: readonly T[], count: number): T[] {
      const pool = [...items];
      const picked: T[] = [];
      const take = Math.min(count, pool.length);
      for (let i = 0; i < take; i += 1) {
        const index = int(0, pool.length - 1);
        picked.push(pool.splice(index, 1)[0] as T);
      }
      return picked;
    },
    bool(probability = 0.5): boolean {
      return next() < probability;
    },
    offsetMinutes(min: number, max: number): number {
      return int(min, max);
    },
  };
}

/**
 * Stable, human-readable identifier derived from a namespace and a key.
 * Used for demo fixtures so every seeded row has the same id on every run,
 * which keeps deep links in documentation and tests valid.
 */
export function stableId(namespace: string, key: string): string {
  const hash = hashString(`${namespace}:${key}`).toString(36).padStart(7, "0");
  const secondary = hashString(`${key}:${namespace}`).toString(36).padStart(7, "0");
  return `${namespace}_${hash}${secondary}`;
}

/** Non-deterministic id for records created at runtime. */
export function generateId(prefix: string): string {
  const random = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${prefix}_${random}`;
}

export function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export function addHours(base: Date, hours: number): Date {
  return addMinutes(base, hours * 60);
}

export function addDays(base: Date, days: number): Date {
  return addMinutes(base, days * 60 * 24);
}

export function iso(date: Date): string {
  return date.toISOString();
}
