import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ForbiddenError, UnauthenticatedError, authorizeApiRequest } from "@/lib/auth/guards";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import { RecordNotFoundError, UniqueConstraintError } from "@/lib/repositories/types";
import { ScanLimitError } from "./scan-service";
import { WorkflowError } from "./report-service";
import { toValidationFailures, type ValidationFailure } from "@/lib/validation/schemas";
import { SsrfBlockedError } from "@/lib/security/ssrf-guard";

/**
 * Shared plumbing for every route handler.
 *
 * Three jobs:
 *   - a single, predictable JSON envelope so the client never has to guess;
 *   - authorisation before the body is even parsed;
 *   - one error translation table, so a repository or workflow error always
 *     becomes the right HTTP status with a message a person can act on
 *     (and never an unhandled 500 with a stack trace in it).
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Field-level problems, keyed to the form control that produced them. */
    failures?: ValidationFailure[];
  };
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function newRequestId(): string {
  return randomUUID();
}

export function jsonOk<T>(data: T, requestId: string, status = 200): NextResponse {
  return NextResponse.json<ApiSuccess<T>>(
    { ok: true, data, requestId },
    {
      status,
      headers: {
        // Request-time data: never cached by a browser or an intermediary.
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  requestId: string,
  failures?: ValidationFailure[],
): NextResponse {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code, message, ...(failures ? { failures } : {}) }, requestId },
    {
      status,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}

/**
 * Translates a thrown error into a response.
 *
 * Anything unrecognised becomes a 500 with a generic message: an internal
 * error message can contain detail that should not reach a browser, so the
 * detail goes to the server log and the client gets the request id to quote.
 */
export function errorToResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return jsonError("UNAUTHENTICATED", "Sign in to continue.", 401, requestId);
  }
  if (error instanceof ForbiddenError) {
    return jsonError("FORBIDDEN", error.message, 403, requestId);
  }
  if (error instanceof RecordNotFoundError) {
    return jsonError("NOT_FOUND", error.message, 404, requestId);
  }
  if (error instanceof UniqueConstraintError) {
    return jsonError("CONFLICT", error.message, 409, requestId);
  }
  if (error instanceof WorkflowError) {
    // A refused workflow transition is a conflict with current state, not a
    // malformed request.
    return jsonError(
      error.code,
      error.message,
      error.code === "INVALID_TRANSITION" || error.code === "CONTENT_FROZEN" ? 409 : 422,
      requestId,
    );
  }
  if (error instanceof ScanLimitError) {
    return jsonError("SCAN_LIMIT_REACHED", error.message, 429, requestId);
  }
  if (error instanceof SsrfBlockedError) {
    return jsonError("BLOCKED_BY_POLICY", error.message, 400, requestId);
  }
  if (error instanceof z.ZodError) {
    return jsonError(
      "VALIDATION_FAILED",
      "Some fields need attention.",
      400,
      requestId,
      toValidationFailures(error),
    );
  }

  console.error(`[sentinel] unhandled error (request ${requestId}):`, error);
  return jsonError(
    "INTERNAL_ERROR",
    `Something went wrong on the server. Quote request id ${requestId} if you report this.`,
    500,
    requestId,
  );
}

export interface HandlerContext {
  auth: AuthenticatedUser;
  requestId: string;
}

/**
 * Wraps a handler with authorisation and error translation.
 *
 * `permission: null` means "authenticated is enough".
 */
export function withAuth<TArgs extends unknown[]>(
  permission: Permission | null,
  handler: (context: HandlerContext, ...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    const requestId = newRequestId();
    try {
      const result = await authorizeApiRequest(permission);
      if (!result.ok) {
        return jsonError(result.code, result.message, result.status, requestId);
      }
      return await handler({ auth: result.auth, requestId }, ...args);
    } catch (error) {
      return errorToResponse(error, requestId);
    }
  };
}

/** Parses and validates a JSON body, answering 400 on malformed input. */
export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  requestId: string,
): Promise<{ ok: true; data: z.infer<TSchema> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError(
        "INVALID_JSON",
        "The request body is not valid JSON.",
        400,
        requestId,
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        "VALIDATION_FAILED",
        "Some fields need attention.",
        400,
        requestId,
        toValidationFailures(parsed.error),
      ),
    };
  }

  return { ok: true, data: parsed.data as z.infer<TSchema> };
}

/** Parses the query string, answering 400 on an invalid filter value. */
export function parseQuery<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  requestId: string,
): { ok: true; data: z.infer<TSchema> } | { ok: false; response: NextResponse } {
  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};

  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : (values[0] ?? "");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        "VALIDATION_FAILED",
        "One or more filters are not valid.",
        400,
        requestId,
        toValidationFailures(parsed.error),
      ),
    };
  }

  return { ok: true, data: parsed.data as z.infer<TSchema> };
}

/** Returns a file download with the right headers. */
export function fileResponse(
  body: Uint8Array | string,
  options: { filename: string; contentType: string; requestId: string },
): NextResponse {
  const payload =
    typeof body === "string" ? new TextEncoder().encode(body) : body;

  return new NextResponse(payload as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": options.contentType,
      // The filename is quoted so a space or comma cannot break the header.
      "content-disposition": `attachment; filename="${options.filename.replace(/"/g, "")}"`,
      "content-length": String(payload.byteLength),
      "cache-control": "no-store",
      "x-request-id": options.requestId,
    },
  });
}
