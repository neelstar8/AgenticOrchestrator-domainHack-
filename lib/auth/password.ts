import "server-only";
import { compare, hash } from "bcryptjs";

/**
 * Password hashing.
 *
 * bcrypt via bcryptjs, which is a proven implementation. No cryptography is
 * invented here and no password is ever stored, logged or returned in any
 * form other than its bcrypt hash.
 */

/**
 * Cost factor. 12 is a reasonable 2026 default: roughly 200-400ms per hash on
 * typical server hardware, which is slow enough to make offline cracking
 * expensive and fast enough for an interactive login.
 */
const BCRYPT_COST = 12;

/** Cost used for seeded demo accounts, where boot time matters more. */
export const DEMO_BCRYPT_COST = 10;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < 10) {
    throw new Error("A password must be at least 10 characters.");
  }
  return hash(plaintext, BCRYPT_COST);
}

/**
 * Verifies a password against a stored hash.
 *
 * `bcrypt.compare` is constant-time with respect to the hash, so this does not
 * leak information through timing on the comparison itself.
 */
export async function verifyPassword(plaintext: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await compare(plaintext, storedHash);
  } catch {
    // A malformed stored hash must fail closed, not throw into a route.
    return false;
  }
}

/**
 * A bcrypt hash of a value no one can log in with.
 *
 * Used so a login attempt against an unknown email still performs a real
 * bcrypt comparison. Without this, "no such user" would return noticeably
 * faster than "wrong password" and the difference would enumerate accounts.
 */
let dummyHashPromise: Promise<string> | null = null;

export function getTimingEqualisationHash(): Promise<string> {
  dummyHashPromise ??= hash("sentinel-nonexistent-account-placeholder", BCRYPT_COST);
  return dummyHashPromise;
}

export interface PasswordStrength {
  acceptable: boolean;
  problems: string[];
}

/** Minimum requirements for a password set through the application. */
export function assessPasswordStrength(plaintext: string): PasswordStrength {
  const problems: string[] = [];
  if (plaintext.length < 12) problems.push("Use at least 12 characters.");
  if (!/[a-z]/.test(plaintext)) problems.push("Include a lowercase letter.");
  if (!/[A-Z]/.test(plaintext)) problems.push("Include an uppercase letter.");
  if (!/\d/.test(plaintext)) problems.push("Include a digit.");
  if (!/[^A-Za-z0-9]/.test(plaintext)) problems.push("Include a symbol.");
  return { acceptable: problems.length === 0, problems };
}
