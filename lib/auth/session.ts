import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

import { getEnv, hasConfiguredSessionSecret } from "@/lib/config/env";
import type { Role } from "@/lib/types/enums";

/**
 * Session handling with iron-session.
 *
 * The cookie is sealed (encrypted and signed) by iron-session, so its contents
 * cannot be read or forged by the client. Sentinel stores only an id, a role
 * and timestamps in it — never a password hash, never a permission list the
 * client could tamper with. Permissions are always derived server-side from
 * the role on each request.
 *
 * Development secret: if SESSION_SECRET is unset outside production, an
 * ephemeral per-process secret is derived so the app boots with no
 * configuration. That secret changes on restart (sessions do not survive a
 * restart), and `hasConfiguredSessionSecret()` is false, which the UI uses to
 * label the session as development-only. Production refuses to start without a
 * real secret — see `assertProductionReady`.
 */

export interface SessionData {
  userId?: string;
  role?: Role;
  /** Unix seconds. Checked on every read so a stale cookie cannot be replayed. */
  issuedAt?: number;
  expiresAt?: number;
  /** Correlates a session with its audit events without storing anything personal. */
  sessionId?: string;
}

const COOKIE_NAME = "sentinel_session";

const GLOBAL_KEY = "__sentinelDevSessionSecret__";
type GlobalWithSecret = typeof globalThis & { [GLOBAL_KEY]?: string };

/**
 * Resolves the sealing password.
 *
 * iron-session requires at least 32 characters. A configured secret is used
 * verbatim; otherwise a random development secret is generated once per
 * process. It is never written to disk and never logged.
 */
function resolveSessionPassword(): string {
  const env = getEnv();

  if (hasConfiguredSessionSecret(env)) {
    return env.SESSION_SECRET as string;
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters in production. Generate one with: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  const scope = globalThis as GlobalWithSecret;
  scope[GLOBAL_KEY] ??= randomBytes(32).toString("hex");
  return scope[GLOBAL_KEY];
}

function sessionOptions(): SessionOptions {
  const env = getEnv();
  return {
    password: resolveSessionPassword(),
    cookieName: COOKIE_NAME,
    ttl: env.SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // Secure in production; a plain-HTTP localhost dev server could not set
      // a Secure cookie, so the flag follows the environment.
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: env.SESSION_TTL_SECONDS,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export interface ActiveSession {
  userId: string;
  role: Role;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Reads the session and validates it, returning null for anything unusable.
 *
 * Expiry is checked here as well as by the cookie's own TTL: a cookie's
 * lifetime is a client-side hint, so the authoritative check belongs on the
 * server.
 */
export async function readActiveSession(): Promise<ActiveSession | null> {
  const session = await getSession();
  if (!session.userId || !session.role || !session.expiresAt || !session.sessionId) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= nowSeconds) {
    session.destroy();
    return null;
  }

  return {
    userId: session.userId,
    role: session.role,
    sessionId: session.sessionId,
    issuedAt: session.issuedAt ?? nowSeconds,
    expiresAt: session.expiresAt,
  };
}

export async function establishSession(userId: string, role: Role): Promise<ActiveSession> {
  const env = getEnv();
  const session = await getSession();
  const nowSeconds = Math.floor(Date.now() / 1000);

  session.userId = userId;
  session.role = role;
  session.issuedAt = nowSeconds;
  session.expiresAt = nowSeconds + env.SESSION_TTL_SECONDS;
  session.sessionId = randomBytes(16).toString("hex");
  await session.save();

  return {
    userId,
    role,
    sessionId: session.sessionId,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  };
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/**
 * Stable, non-reversible identifier for a client, for rate limiting only.
 *
 * The IP is hashed with the session password so the stored value cannot be
 * turned back into an address, and nothing identifying is written to the audit
 * log.
 */
export function hashClientIdentifier(value: string): string {
  return createHash("sha256")
    .update(`${resolveSessionPassword()}:${value}`)
    .digest("hex")
    .slice(0, 32);
}

/** True when the session layer is running on an ephemeral dev secret. */
export function isDevelopmentSessionSecret(): boolean {
  return !hasConfiguredSessionSecret();
}
