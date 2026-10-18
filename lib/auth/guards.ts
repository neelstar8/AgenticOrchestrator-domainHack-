import "server-only";
import { redirect } from "next/navigation";

import { getRepository } from "@/lib/repositories";
import type { User } from "@/lib/types/models";
import { hasPermission, PERMISSION_DESCRIPTIONS, permissionsFor, type Permission } from "./permissions";
import { readActiveSession, isDevelopmentSessionSecret } from "./session";

/**
 * Server-side authorisation.
 *
 * This is the Data Access Layer boundary: every route handler, server action
 * and page that touches real data resolves the caller through one of these
 * functions. Nothing trusts a role, a permission or an id supplied by the
 * client — the role comes from the sealed session cookie and the permissions
 * are derived from it here, on the server, on every request.
 */

export interface AuthenticatedUser {
  user: User;
  permissions: readonly Permission[];
  sessionId: string;
  /** True when the session layer is using an ephemeral development secret. */
  isDevelopmentSession: boolean;
  can(permission: Permission): boolean;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(
    public readonly permission: Permission,
    public readonly role: string,
  ) {
    super(
      `This action requires the "${permission}" permission (${PERMISSION_DESCRIPTIONS[permission]}), ` +
        `which the ${role} role does not have.`,
    );
    this.name = "ForbiddenError";
  }
}

/**
 * The serialisable part of a resolved session.
 *
 * Kept separate from `AuthenticatedUser` because a `use cache` scope can only
 * return serialisable values — a method on the object would be rejected. The
 * `can` helper is therefore attached outside the cache boundary.
 */
interface CachedSessionUser {
  user: User;
  permissions: readonly Permission[];
  sessionId: string;
  isDevelopmentSession: boolean;
}

/**
 * Reads and validates the session, returning a plain object.
 *
 * `'use cache: private'` keeps the result in the browser's private cache for
 * the Cache Components lifetime, so a navigation does not re-read the cookie
 * and re-query the repository. Nothing is cached on the server, and a redirect
 * throws rather than returning, so only a resolved user is ever cached. See
 * the Next.js authentication-with-cache-components guide.
 */
async function getCachedSessionUser(): Promise<CachedSessionUser | null> {
  "use cache: private";

  const session = await readActiveSession();
  if (!session) return null;

  const repository = await getRepository();
  const user = await repository.getUserById(session.userId);

  // A session for a removed or deactivated account is not a session.
  if (!user || !user.isActive) return null;

  return {
    user,
    // The role is re-read from the stored user rather than taken from the
    // cookie, so a role change takes effect on the next request.
    permissions: permissionsFor(user.role),
    sessionId: session.sessionId,
    isDevelopmentSession: isDevelopmentSessionSecret(),
  };
}

/** Resolves the current user, or null. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cached = await getCachedSessionUser();
  if (!cached) return null;

  return {
    ...cached,
    can: (permission: Permission) => hasPermission(cached.user.role, permission),
  };
}

/** For pages: redirects to the login screen when there is no session. */
export async function requireUser(returnTo?: string): Promise<AuthenticatedUser> {
  const current = await getCurrentUser();
  if (!current) {
    const target = returnTo
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    redirect(target);
  }
  return current;
}

/** For pages: redirects when unauthenticated, throws when unauthorised. */
export async function requirePermission(
  permission: Permission,
  returnTo?: string,
): Promise<AuthenticatedUser> {
  const current = await requireUser(returnTo);
  if (!current.can(permission)) {
    throw new ForbiddenError(permission, current.user.role);
  }
  return current;
}

/**
 * For route handlers: returns a typed result instead of redirecting, so the
 * handler can answer 401 or 403 with a useful body.
 */
export type ApiAuthResult =
  | { ok: true; auth: AuthenticatedUser }
  | { ok: false; status: 401 | 403; code: string; message: string };

export async function authorizeApiRequest(
  permission: Permission | null,
): Promise<ApiAuthResult> {
  const current = await getCurrentUser();

  if (!current) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
    };
  }

  if (permission && !current.can(permission)) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message:
        `This action requires "${permission}" (${PERMISSION_DESCRIPTIONS[permission]}). ` +
        `The ${current.user.role} role does not have it.`,
    };
  }

  return { ok: true, auth: current };
}
