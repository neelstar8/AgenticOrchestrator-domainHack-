import "server-only";

import { getEnv } from "@/lib/config/env";
import { safeFetch } from "@/lib/security/safe-fetch";
import type {
  ProviderContext,
  ProviderDescriptor,
  ProviderResult,
  RegulatoryCheckOutcome,
  RegulatorySourceProvider,
} from "@/agents/providers/types";
import { providerFailed, providerOk } from "@/agents/providers/types";
import { extractVisibleText } from "./http-website-inspection-provider";
import type { MatchType } from "@/lib/types/enums";

/**
 * Live regulatory source retrieval.
 *
 * Retrieves a configured official document through the safe-fetch layer and
 * searches its visible text for the supplied terms. Active only when
 * REGULATORY_SOURCE_PROVIDER is not "mock" AND live fetching is enabled.
 *
 * What it will not do:
 *   - Invent content. If the retrieval fails, the check is recorded as failed.
 *     A failure never becomes "no match found".
 *   - Treat a non-match as authorisation. Non-matches are returned in
 *     `checkedWithoutMatch` and the note states explicitly what that means.
 *   - Interpret. It reports that a term appears in a document, with the
 *     surrounding text, and leaves the judgement to a human reviewer.
 */

const CONTEXT_RADIUS = 220;

export class HttpRegulatorySourceProvider implements RegulatorySourceProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "http-regulatory-source",
    label: "Live regulatory source retrieval",
    description:
      "Retrieves a configured official publication through the safe-fetch layer and reports " +
      "which supplied terms appear in its visible text, with surrounding context.",
    isLive: true,
    origin: "LIVE_COLLECTED",
    requiredEnv: ["REGULATORY_SOURCE_PROVIDER", "SENTINEL_ALLOW_LIVE_FETCH"],
  };

  async check(
    request: {
      source: { sourceId: string; authorityShortName: string; title: string; sourceUrl: string };
      terms: Array<{ term: string; domainId: string | null; kind: "domain" | "entity" }>;
    },
    context: ProviderContext,
  ): Promise<ProviderResult<RegulatoryCheckOutcome>> {
    const started = Date.now();
    const startedAt = new Date().toISOString();
    const env = getEnv();

    if (!env.SENTINEL_ALLOW_LIVE_FETCH) {
      return providerFailed(
        {
          code: "NOT_CONFIGURED",
          message:
            "Live fetching is disabled, so no official source can be retrieved. No content was " +
            "generated for this source.",
          retryable: false,
        },
        {
          providerId: this.descriptor.id,
          origin: "LIVE_COLLECTED",
          durationMs: 0,
          warnings: [],
        },
      );
    }

    const result = await safeFetch(request.source.sourceUrl, {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.5",
      signal: context.signal,
    });

    if (!result.ok) {
      return providerFailed(
        {
          code:
            result.code === "TIMEOUT"
              ? "TIMEOUT"
              : result.code === "RATE_LIMITED"
                ? "RATE_LIMITED"
                : result.code === "BLOCKED"
                  ? "BLOCKED_BY_POLICY"
                  : "UPSTREAM_ERROR",
          message:
            `Retrieval of "${request.source.title}" failed: ${result.message} ` +
            "This is recorded as a failed check. It produces no information about any term, in " +
            "either direction, and must not be read as an absence of matches.",
          retryable: result.retryable,
        },
        {
          providerId: this.descriptor.id,
          origin: "LIVE_COLLECTED",
          durationMs: Date.now() - started,
          warnings: [],
        },
      );
    }

    const contentType = result.headers["content-type"] ?? "";
    const warnings: string[] = [];

    if (contentType.includes("application/pdf")) {
      // Honest about a real limitation rather than silently returning no
      // matches from a document that was never actually read.
      return providerFailed(
        {
          code: "INVALID_RESPONSE",
          message:
            `"${request.source.title}" is a PDF. Sentinel does not extract PDF text, so this ` +
            "source cannot be checked automatically and must be reviewed by a person. No match " +
            "or non-match has been recorded.",
          retryable: false,
        },
        {
          providerId: this.descriptor.id,
          origin: "LIVE_COLLECTED",
          durationMs: Date.now() - started,
          warnings: ["PDF sources require manual review."],
        },
      );
    }

    if (result.truncated) {
      warnings.push(
        "The document exceeded the response-size limit and was truncated. Terms appearing only " +
          "after the cut-off would not be found, so a non-match from this check is inconclusive.",
      );
    }

    const text = extractVisibleText(result.body);
    const haystack = text.toLowerCase();

    const matches: RegulatoryCheckOutcome["matches"] = [];
    const checkedWithoutMatch: string[] = [];

    for (const term of request.terms) {
      const needle = term.term.toLowerCase().trim();
      if (needle === "") continue;

      const index = haystack.indexOf(needle);
      if (index === -1) {
        checkedWithoutMatch.push(term.term);
        continue;
      }

      const from = Math.max(0, index - CONTEXT_RADIUS);
      const to = Math.min(text.length, index + needle.length + CONTEXT_RADIUS);

      matches.push({
        term: term.term,
        domainId: term.domainId,
        matchType: classifyMatch(needle, haystack, term.kind),
        // Confidence reflects match specificity, not the strength of any
        // conclusion. An exact domain string is specific; a brand token is not.
        confidence: term.kind === "domain" ? 85 : 40,
        context:
          (from > 0 ? "…" : "") +
          text.slice(from, to).replace(/\s+/g, " ").trim() +
          (to < text.length ? "…" : ""),
      });
    }

    const outcome: RegulatoryCheckOutcome = {
      sourceId: request.source.sourceId,
      startedAt,
      completedAt: new Date().toISOString(),
      httpStatusCode: result.statusCode,
      bytesRetrieved: result.bytesRead,
      lastModifiedReported: parseLastModified(result.headers["last-modified"]),
      matches,
      checkedWithoutMatch,
      note:
        `Retrieved ${result.bytesRead} bytes from ${result.finalUrl} with status ` +
        `${result.statusCode}. ${matches.length} term(s) appear in the document and ` +
        `${checkedWithoutMatch.length} do not. A term NOT appearing in this document means only ` +
        "that: it is not evidence of authorisation, and it is not evidence of wrongdoing. Every " +
        "match requires human verification against the published document before it can support " +
        "any conclusion." +
        (result.truncated ? " NOTE: the document was truncated at the size limit." : ""),
    };

    return providerOk(outcome, {
      providerId: this.descriptor.id,
      origin: "LIVE_COLLECTED",
      durationMs: Date.now() - started,
      warnings,
    });
  }
}

function classifyMatch(
  needle: string,
  haystack: string,
  kind: "domain" | "entity",
): MatchType {
  if (kind === "domain") return "EXACT_DOMAIN";
  // A term surrounded by word boundaries reads as a name; otherwise it is a
  // substring collision, which is the commonest source of false positives.
  const boundaryPattern = new RegExp(`\\b${escapeRegExp(needle)}\\b`);
  if (boundaryPattern.test(haystack)) return "EXACT_ENTITY_NAME";
  return "BRAND_TOKEN";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLastModified(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
