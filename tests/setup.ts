import { afterEach, beforeAll, vi } from "vitest";

// Deterministic test environment: demo mode, isolated data dir, fixed secret.
process.env.SENTINEL_MODE = "demo";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "vitest-only-session-secret-not-for-production-use";
process.env.SENTINEL_ALLOW_LIVE_FETCH = "false";
process.env.SENTINEL_ALLOW_DEV_RESET = "true";

beforeAll(async () => {
  // jest-dom matchers are only meaningful in the jsdom projects.
  if (typeof window !== "undefined") {
    await import("@testing-library/jest-dom/vitest");
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});
