import "server-only";
import { headers } from "next/headers";

import { getRepository } from "@/lib/repositories";
import { getTimingEqualisationHash, verifyPassword } from "@/lib/auth/password";
import { destroySession, establishSession, hashClientIdentifier, readActiveSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
import { TokenBucketRateLimiter } from "@/lib/security/rate-limiter";
import type { User } from "@/lib/types/models";
import type { LoginInput } from "@/lib/validation/schemas";

/**
 * Authentication service.
 *
 * Deliberate properties:
 *
 *  - One generic failure message. "No such account" and "wrong password" are
 *    indistinguishable to the client, so a login form cannot be used to
 *    enumerate who has an account.
 *  - Constant-ish timing. An unknown email still performs a real bcrypt
 *    comparison against a throwaway hash, so response time does not reveal
 *    whether the account exists.
 *  - Rate limiting per client and per email, so a stolen password list cannot
 *    be sprayed at the form.
 *  - The session carries an id and a role, never a permission list. Permissions
 *    are re-derived from the stored user on every request.
 */

const ATTEMPTS_PER_MINUTE = 10;

const GLOBAL_KEY = "__sentinelLoginLimiter__";
type GlobalWithLimiter = typeof globalThis & { [GLOBAL_KEY]?: TokenBucketRateLimiter };

function loginLimiter(): TokenBucketRateLimiter {
  const scope = globalThis as GlobalWithLimiter;
  scope[GLOBAL_KEY] ??= new TokenBucketRateLimiter(ATTEMPTS_PER_MINUTE, ATTEMPTS_PER_MINUTE);
  return scope[GLOBAL_KEY];
}

export type LoginResult =
  | { ok: true; user: User; permissions: readonly string[] }
  | { ok: false; code: "INVALID_CREDENTIALS" | "RATE_LIMITED" | "ACCOUNT_DISABLED"; message: string; retryAfterMs?: number };

/** Hashed client identifier, used only for rate limiting. */
async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headerList.get("x-real-ip");
  return hashClientIdentifier(forwarded || realIp || "unknown-client");
}

export async function login(input: LoginInput, requestId: string): Promise<LoginResult> {
  const limiter = loginLimiter();
  const client = await clientKey();

  // Two buckets: one per client, one per target account. Either being
  // exhausted stops the attempt.
  for (const key of [`client:${client}`, `email:${input.email}`]) {
    const decision = limiter.tryConsume(key);
    if (!decision.allowed) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: `Too many sign-in attempts. Try again in about ${Math.ceil(decision.retryAfterMs / 1000)} seconds.`,
        retryAfterMs: decision.retryAfterMs,
      };
    }
  }

  const repository = await getRepository();
  const candidate = await repository.findUserWithSecretByEmail(input.email);

  // Always perform a bcrypt comparison, even with no matching account, so the
  // timing of the two outcomes does not differ meaningfully.
  const hashToCompare = candidate?.passwordHash ?? (await getTimingEqualisationHash());
  const passwordMatches = await verifyPassword(input.password, hashToCompare);

  if (!candidate || !passwordMatches) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      // Deliberately generic: this must not reveal whether the email exists.
      message: "That email and password combination is not recognised.",
    };
  }

  if (!candidate.isActive) {
    return {
      ok: false,
      code: "ACCOUNT_DISABLED",
      message: "This account is disabled. Ask an administrator to re-enable it.",
    };
  }

  const now = new Date().toISOString();
  await establishSession(candidate.id, candidate.role);
  await repository.recordUserLogin(candidate.id, now);

  await repository.appendAuditEvent({
    actorId: candidate.id,
    actorLabel: candidate.name,
    action: "USER_SIGNED_IN",
    entityType: "USER",
    entityId: candidate.id,
    entityLabel: candidate.name,
    newState: { role: candidate.role },
    // No IP address and no email is recorded: a hashed client key would add
    // nothing to the audit trail that is worth storing.
    reason: "Signed in.",
    requestId,
  });

  const { passwordHash: _hash, ...user } = candidate;
  return { ok: true, user, permissions: permissionsFor(candidate.role) };
}

export async function logout(requestId: string): Promise<void> {
  const session = await readActiveSession();

  if (session) {
    const repository = await getRepository();
    const user = await repository.getUserById(session.userId);
    if (user) {
      await repository.appendAuditEvent({
        actorId: user.id,
        actorLabel: user.name,
        action: "USER_SIGNED_OUT",
        entityType: "USER",
        entityId: user.id,
        entityLabel: user.name,
        reason: "Signed out.",
        requestId,
      });
    }
  }

  await destroySession();
}

/** Demo accounts shown on the login screen so the demo is usable. */
export async function listDemoAccounts(): Promise<
  Array<{ email: string; name: string; role: string; jobTitle: string | null }>
> {
  const repository = await getRepository();
  const users = await repository.listUsers();

  return users
    .filter((user) => user.isDemoUser && user.isActive)
    .map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      jobTitle: user.jobTitle,
    }));
}
