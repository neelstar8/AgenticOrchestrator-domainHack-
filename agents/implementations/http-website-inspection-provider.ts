import "server-only";
import { createHash } from "node:crypto";
import { connect as tlsConnect } from "node:tls";

import { getEnv } from "@/lib/config/env";
import { safeFetch } from "@/lib/security/safe-fetch";
import { resolveAndPin, normalizeOutboundUrl, SsrfBlockedError } from "@/lib/security/ssrf-guard";
import { tryNormalizeDomain } from "@/lib/utils/domain-name";
import type {
  InspectionObservation,
  ProviderContext,
  ProviderDescriptor,
  ProviderResult,
  WebsiteInspectionProvider,
} from "@/agents/providers/types";
import { providerFailed, providerOk } from "@/agents/providers/types";

/**
 * Live website inspection over the safe-fetch layer.
 *
 * Active only when SENTINEL_ALLOW_LIVE_FETCH=true. Everything it does is
 * limited to what an ordinary visitor would see:
 *
 *   - GET the public root path, nothing else. No path enumeration, no
 *     /admin or /.git probing, no wordlists.
 *   - Read the response head and a size-capped body.
 *   - Parse title, meta description, language and outbound hostnames with
 *     regular expressions. The HTML is NEVER executed, never passed to a
 *     browser engine, and never rendered in a privileged context.
 *   - Observe the TLS certificate the server already presents during the
 *     normal handshake.
 *
 * It does not and must not: authenticate, bypass anything, submit a form,
 * collect credentials, or test for vulnerabilities.
 */

const MAX_TEXT_EXCERPT = 1200;

export class HttpWebsiteInspectionProvider implements WebsiteInspectionProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "http-website-inspection",
    label: "Live website inspection",
    description:
      "Requests the public root path of each host through the SSRF guard, rate limiter and size " +
      "caps in lib/security, and records what a visitor would see. No authentication, probing or " +
      "script execution of any kind.",
    isLive: true,
    origin: "LIVE_COLLECTED",
    requiredEnv: ["SENTINEL_ALLOW_LIVE_FETCH"],
  };

  async inspect(
    request: { fqdns: string[]; maxBytesPerHost: number; maxRedirects: number },
    context: ProviderContext,
  ): Promise<ProviderResult<InspectionObservation[]>> {
    const started = Date.now();
    const env = getEnv();

    if (!env.SENTINEL_ALLOW_LIVE_FETCH) {
      return providerFailed(
        {
          code: "NOT_CONFIGURED",
          message:
            "Live inspection is disabled (SENTINEL_ALLOW_LIVE_FETCH=false). No request was made.",
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

    const observations: InspectionObservation[] = [];
    const warnings: string[] = [];

    for (const fqdn of request.fqdns) {
      if (context.signal.aborted) break;

      const parsed = tryNormalizeDomain(fqdn);
      if (!parsed) {
        warnings.push(`Skipped "${fqdn}": not a valid hostname.`);
        continue;
      }

      observations.push(
        await this.inspectOne(parsed.fqdn, request, context, warnings),
      );
    }

    return providerOk(observations, {
      providerId: this.descriptor.id,
      origin: "LIVE_COLLECTED",
      durationMs: Date.now() - started,
      warnings,
    });
  }

  private async inspectOne(
    fqdn: string,
    request: { maxBytesPerHost: number; maxRedirects: number },
    context: ProviderContext,
    warnings: string[],
  ): Promise<InspectionObservation> {
    const observedAt = new Date().toISOString();

    const empty: InspectionObservation = {
      fqdn,
      observedAt,
      httpStatusCode: null,
      finalUrl: null,
      redirectedToUrl: null,
      title: null,
      description: null,
      language: null,
      textExcerpt: null,
      detectedTechnologies: [],
      outboundHostnames: [],
      certificate: null,
      bytesRead: null,
      error: null,
    };

    const result = await safeFetch(`https://${fqdn}/`, {
      maxBytes: request.maxBytesPerHost,
      maxRedirects: request.maxRedirects,
      signal: context.signal,
    });

    if (!result.ok) {
      warnings.push(`${fqdn}: ${result.code} — ${result.message}`);
      // A failed check yields no observations. The registry keeps showing
      // "Not checked" rather than implying a negative finding.
      return {
        ...empty,
        error: { code: result.code, message: result.message },
      };
    }

    const html = result.body;
    const certificate = await this.observeCertificate(fqdn, context).catch(() => null);

    return {
      ...empty,
      httpStatusCode: result.statusCode,
      finalUrl: result.finalUrl,
      redirectedToUrl:
        result.redirectChain.length > 0 ? result.finalUrl : null,
      title: extractTitle(html),
      description: extractMetaContent(html, "description"),
      language: extractLanguage(html),
      textExcerpt: extractVisibleText(html).slice(0, MAX_TEXT_EXCERPT) || null,
      detectedTechnologies: detectTechnologies(html, result.headers),
      outboundHostnames: extractOutboundHostnames(html, fqdn),
      certificate,
      bytesRead: result.bytesRead,
      error: null,
    };
  }

  /**
   * Reads the certificate the server presents during an ordinary TLS
   * handshake, connecting to the SSRF-validated pinned address.
   */
  private async observeCertificate(
    fqdn: string,
    context: ProviderContext,
  ): Promise<InspectionObservation["certificate"]> {
    let target;
    try {
      target = await resolveAndPin(normalizeOutboundUrl(`https://${fqdn}/`));
    } catch (error) {
      if (error instanceof SsrfBlockedError) return null;
      throw error;
    }

    return new Promise((resolve) => {
      const socket = tlsConnect({
        host: target.pinnedAddress,
        port: target.port,
        servername: target.hostname,
        // Certificate characteristics are being OBSERVED, not trusted. A
        // self-signed or expired certificate is itself a fact worth recording,
        // so verification failure must not prevent observation. No data is
        // sent and no body is read over this socket.
        rejectUnauthorized: false,
        timeout: 6_000,
      });

      const finish = (value: InspectionObservation["certificate"]) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };

      const onAbort = () => finish(null);
      context.signal.addEventListener("abort", onAbort, { once: true });

      socket.once("secureConnect", () => {
        const peer = socket.getPeerCertificate(false);
        context.signal.removeEventListener("abort", onAbort);

        if (!peer || Object.keys(peer).length === 0) return finish(null);

        const fingerprint =
          typeof peer.fingerprint256 === "string"
            ? peer.fingerprint256.replace(/:/g, "").toLowerCase()
            : peer.raw
              ? createHash("sha256").update(peer.raw).digest("hex")
              : null;

        if (!fingerprint) return finish(null);

        finish({
          issuer:
            [firstValue(peer.issuer?.O), firstValue(peer.issuer?.CN)]
              .filter(Boolean)
              .join(" - ") || "Unknown issuer",
          subjectCommonName: firstValue(peer.subject?.CN) ?? fqdn,
          notBefore: safeIso(peer.valid_from),
          notAfter: safeIso(peer.valid_to),
          fingerprintSha256: fingerprint,
        });
      });

      socket.once("timeout", () => finish(null));
      socket.once("error", () => finish(null));
    });
  }
}

/** Node's certificate fields may be a string or an array of strings. */
function firstValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function safeIso(value: string | undefined): string {
  if (!value) return new Date(0).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

// ---------------------------------------------------------------------------
// HTML extraction
//
// Regex parsing rather than a DOM library, deliberately: there is no DOM, no
// script execution and no parser to exploit. The inputs are untrusted, so the
// aim is to read a few fields and nothing more.
// ---------------------------------------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title === "" ? null : title.slice(0, 300);
}

export function extractMetaContent(html: string, name: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']{0,600})["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']{0,600})["'][^>]*name=["']${name}["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+property=["']og:${name}["'][^>]*content=["']([^"']{0,600})["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const value = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
      if (value !== "") return value.slice(0, 500);
    }
  }
  return null;
}

export function extractLanguage(html: string): string | null {
  const match = /<html[^>]+lang=["']([a-zA-Z-]{2,12})["']/i.exec(html);
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractOutboundHostnames(html: string, selfFqdn: string): string[] {
  const hostnames = new Set<string>();
  const pattern = /(?:href|src)=["'](https?:\/\/[^"'\s]{1,500})["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    if (hostnames.size >= 40) break;
    try {
      const hostname = new URL(match[1] as string).hostname.toLowerCase();
      if (hostname !== selfFqdn && hostname !== "") hostnames.add(hostname);
    } catch {
      // Unparseable URLs in untrusted markup are simply ignored.
    }
  }
  return [...hostnames];
}

export function detectTechnologies(
  html: string,
  headers: Record<string, string>,
): string[] {
  const detected = new Set<string>();

  const headerSignals: Array<[string, string]> = [
    ["cf-ray", "Cloudflare"],
    ["x-powered-by", headers["x-powered-by"] ?? ""],
    ["server", headers.server ?? ""],
  ];
  for (const [key, label] of headerSignals) {
    if (headers[key] && label) detected.add(label.slice(0, 60));
  }

  const bodySignals: Array<[RegExp, string]> = [
    [/wp-content|wp-includes/i, "WordPress"],
    [/_next\/static/i, "Next.js"],
    [/__NUXT__/i, "Nuxt"],
    [/data-reactroot|react-dom/i, "React"],
    [/ng-version=/i, "Angular"],
    [/cdn\.shopify\.com/i, "Shopify"],
    [/bootstrap(?:\.min)?\.css/i, "Bootstrap"],
    [/jquery(?:\.min)?\.js/i, "jQuery"],
    [/googletagmanager\.com/i, "Google Tag Manager"],
  ];
  for (const [pattern, label] of bodySignals) {
    if (pattern.test(html)) detected.add(label);
  }

  return [...detected].slice(0, 12);
}
