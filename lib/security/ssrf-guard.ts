import "server-only";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Outbound-request safety.
 *
 * Sentinel's whole job is to look at websites that may be hostile or
 * misleading, so the outbound path is treated as an attack surface rather than
 * a convenience. This module answers one question: "is it safe to connect to
 * this URL, right now, and to this specific IP address?"
 *
 * The defences, and why each is here:
 *
 *  - Protocol allowlist. Only http and https. A `file:`, `gopher:` or
 *    `jar:` URL in discovered content must never become a request.
 *  - Address blocking. Private, loopback, link-local, CGNAT, multicast,
 *    unique-local and cloud-metadata ranges are refused. 169.254.169.254 is
 *    the classic cloud-credential theft target.
 *  - Resolve-then-pin. DNS is resolved HERE, the resolved address is checked,
 *    and the caller connects to that pinned address. Checking a hostname and
 *    then letting the HTTP client resolve it again is a DNS-rebinding hole:
 *    the second lookup can return 127.0.0.1.
 *  - Redirect revalidation. Every hop is re-validated from scratch. A public
 *    host redirecting to http://169.254.169.254/ is the obvious bypass.
 *  - Credential stripping. Userinfo in a URL is removed, and no Sentinel
 *    header, cookie or token is ever forwarded to a third-party host.
 *
 * Only publicly reachable pages are ever requested. Nothing here attempts
 * authentication, enumeration of non-public paths, or any kind of probing.
 */

export type SsrfRejectionReason =
  | "INVALID_URL"
  | "PROTOCOL_NOT_ALLOWED"
  | "CREDENTIALS_IN_URL"
  | "HOSTNAME_MISSING"
  | "HOSTNAME_NOT_PUBLIC"
  | "PORT_NOT_ALLOWED"
  | "DNS_RESOLUTION_FAILED"
  | "ADDRESS_NOT_PUBLIC";

export class SsrfBlockedError extends Error {
  constructor(
    public readonly reason: SsrfRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Ports Sentinel will connect to. Restricting these prevents a discovered URL
 * from being used to reach an internal service on an unusual port.
 */
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/** Hostnames that must never be resolved, regardless of what DNS would say. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
  ".in-addr.arpa",
  ".ip6.arpa",
  // Reserved by RFC 2606/6761 — never routable, so never worth a request.
  ".test",
  ".example",
  ".invalid",
];

function ipv4ToInt(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** CIDR blocks that are not public internet destinations. */
const BLOCKED_IPV4_RANGES: Array<{ cidr: string; label: string }> = [
  { cidr: "0.0.0.0/8", label: "current network" },
  { cidr: "10.0.0.0/8", label: "private" },
  { cidr: "100.64.0.0/10", label: "carrier-grade NAT" },
  { cidr: "127.0.0.0/8", label: "loopback" },
  { cidr: "169.254.0.0/16", label: "link-local / cloud metadata" },
  { cidr: "172.16.0.0/12", label: "private" },
  { cidr: "192.0.0.0/24", label: "IETF protocol assignments" },
  { cidr: "192.0.2.0/24", label: "documentation (TEST-NET-1)" },
  { cidr: "192.88.99.0/24", label: "6to4 relay anycast" },
  { cidr: "192.168.0.0/16", label: "private" },
  { cidr: "198.18.0.0/15", label: "benchmarking" },
  { cidr: "198.51.100.0/24", label: "documentation (TEST-NET-2)" },
  { cidr: "203.0.113.0/24", label: "documentation (TEST-NET-3)" },
  { cidr: "224.0.0.0/4", label: "multicast" },
  { cidr: "240.0.0.0/4", label: "reserved" },
  { cidr: "255.255.255.255/32", label: "broadcast" },
];

const PARSED_IPV4_RANGES = BLOCKED_IPV4_RANGES.map(({ cidr, label }) => {
  const [network, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  const base = ipv4ToInt(network ?? "") ?? 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: (base & mask) >>> 0, mask, label, cidr };
});

function classifyIpv4(address: string): { blocked: true; label: string } | { blocked: false } {
  const value = ipv4ToInt(address);
  if (value === null) return { blocked: true, label: "unparseable IPv4 address" };
  for (const range of PARSED_IPV4_RANGES) {
    if (((value & range.mask) >>> 0) === range.base) {
      return { blocked: true, label: `${range.label} (${range.cidr})` };
    }
  }
  return { blocked: false };
}

function expandIpv6(address: string): string[] | null {
  const trimmed = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (trimmed === "") return null;

  // IPv4-mapped and IPv4-compatible forms embed an IPv4 address.
  const ipv4Match = /(\d+\.\d+\.\d+\.\d+)$/.exec(trimmed);
  const halves = trimmed.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): string[] =>
    part === "" ? [] : part.split(":").filter((group) => group !== "");

  let head = toGroups(halves[0] ?? "");
  let tail = halves.length === 2 ? toGroups(halves[1] ?? "") : [];

  if (ipv4Match) {
    const embedded = ipv4ToInt(ipv4Match[1] as string);
    if (embedded === null) return null;
    const high = ((embedded >>> 16) & 0xffff).toString(16);
    const low = (embedded & 0xffff).toString(16);
    const replaceLast = (groups: string[]) =>
      groups.slice(0, -1).concat([high, low]);
    if (tail.length > 0 && /\d+\.\d+\.\d+\.\d+/.test(tail.at(-1) ?? "")) {
      tail = replaceLast(tail);
    } else if (head.length > 0 && /\d+\.\d+\.\d+\.\d+/.test(head.at(-1) ?? "")) {
      head = replaceLast(head);
    }
  }

  const missing = 8 - (head.length + tail.length);
  if (halves.length === 2) {
    if (missing < 0) return null;
    return [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  }
  if (head.length !== 8) return null;
  return head;
}

function classifyIpv6(address: string): { blocked: true; label: string } | { blocked: false } {
  const groups = expandIpv6(address);
  if (!groups) return { blocked: true, label: "unparseable IPv6 address" };

  const values = groups.map((group) => Number.parseInt(group || "0", 16));
  if (values.some((value) => Number.isNaN(value))) {
    return { blocked: true, label: "unparseable IPv6 address" };
  }

  const isAllZeroExcept = (lastValue: number) =>
    values.slice(0, 7).every((value) => value === 0) && values[7] === lastValue;

  if (isAllZeroExcept(1)) return { blocked: true, label: "IPv6 loopback (::1)" };
  if (values.every((value) => value === 0)) return { blocked: true, label: "unspecified (::)" };

  const first = values[0] ?? 0;
  // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfe80) return { blocked: true, label: "IPv6 link-local (fe80::/10)" };
  // fc00::/7 unique local
  if ((first & 0xfe00) === 0xfc00) return { blocked: true, label: "IPv6 unique-local (fc00::/7)" };
  // ff00::/8 multicast
  if ((first & 0xff00) === 0xff00) return { blocked: true, label: "IPv6 multicast (ff00::/8)" };
  // 2001:db8::/32 documentation
  if (first === 0x2001 && values[1] === 0x0db8) {
    return { blocked: true, label: "IPv6 documentation (2001:db8::/32)" };
  }
  // 64:ff9b::/96 NAT64 — may translate to a private IPv4.
  if (first === 0x0064 && values[1] === 0xff9b) {
    return { blocked: true, label: "NAT64 prefix (64:ff9b::/96)" };
  }
  // ::ffff:0:0/96 IPv4-mapped — classify the embedded IPv4 instead.
  if (
    values.slice(0, 5).every((value) => value === 0) &&
    values[5] === 0xffff
  ) {
    const high = values[6] ?? 0;
    const low = values[7] ?? 0;
    const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
    const nested = classifyIpv4(ipv4);
    if (nested.blocked) {
      return { blocked: true, label: `IPv4-mapped ${nested.label}` };
    }
  }

  return { blocked: false };
}

/** True when it is safe to open a connection to this literal IP address. */
export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !classifyIpv4(address).blocked;
  if (family === 6) return !classifyIpv6(address).blocked;
  return false;
}

export function describeBlockedAddress(address: string): string | null {
  const family = isIP(address);
  const result = family === 4 ? classifyIpv4(address) : family === 6 ? classifyIpv6(address) : null;
  if (result === null) return "not a valid IP address";
  return result.blocked ? result.label : null;
}

export interface ValidatedTarget {
  /** Normalised URL with credentials stripped. */
  url: URL;
  hostname: string;
  /** The specific address the caller must connect to. */
  pinnedAddress: string;
  addressFamily: 4 | 6;
  port: number;
}

/**
 * Normalises a URL and refuses anything that is not a plain public http(s)
 * destination. Does not perform DNS; see `resolveAndPin`.
 */
export function normalizeOutboundUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SsrfBlockedError("INVALID_URL", `"${input}" is not a valid absolute URL.`);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(
      "PROTOCOL_NOT_ALLOWED",
      `Refused "${url.protocol}". Only http and https are permitted.`,
    );
  }

  if (url.username !== "" || url.password !== "") {
    // Rather than silently stripping, this is refused: a URL carrying
    // credentials is a signal worth surfacing to the operator.
    throw new SsrfBlockedError(
      "CREDENTIALS_IN_URL",
      "Refused a URL containing embedded credentials.",
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "") {
    throw new SsrfBlockedError("HOSTNAME_MISSING", "The URL has no hostname.");
  }

  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!ALLOWED_PORTS.has(port)) {
    throw new SsrfBlockedError(
      "PORT_NOT_ALLOWED",
      `Refused port ${port}. Permitted ports: ${[...ALLOWED_PORTS].join(", ")}.`,
    );
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfBlockedError(
      "HOSTNAME_NOT_PUBLIC",
      `Refused the non-public hostname "${hostname}".`,
    );
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new SsrfBlockedError(
        "HOSTNAME_NOT_PUBLIC",
        `Refused "${hostname}": the "${suffix}" suffix is not a public internet destination.`,
      );
    }
  }

  // A literal IP in the URL is checked immediately.
  const family = isIP(hostname.replace(/^\[|\]$/g, ""));
  if (family !== 0) {
    const blockedLabel = describeBlockedAddress(hostname.replace(/^\[|\]$/g, ""));
    if (blockedLabel) {
      throw new SsrfBlockedError(
        "ADDRESS_NOT_PUBLIC",
        `Refused the IP literal "${hostname}": ${blockedLabel}.`,
      );
    }
  }

  return url;
}

/**
 * Resolves the hostname and pins a single validated public address.
 *
 * The returned `pinnedAddress` is what the caller must actually connect to.
 * Re-resolving the hostname at connection time would reopen the rebinding
 * hole this function exists to close.
 */
export async function resolveAndPin(url: URL): Promise<ValidatedTarget> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (!isPublicIpAddress(hostname)) {
      throw new SsrfBlockedError(
        "ADDRESS_NOT_PUBLIC",
        `Refused "${hostname}": ${describeBlockedAddress(hostname)}.`,
      );
    }
    return {
      url,
      hostname,
      pinnedAddress: hostname,
      addressFamily: literalFamily === 4 ? 4 : 6,
      port,
    };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new SsrfBlockedError(
      "DNS_RESOLUTION_FAILED",
      `Could not resolve "${hostname}": ${error instanceof Error ? error.message : String(error)}. ` +
        "Recorded as a failed check; nothing is inferred from it.",
    );
  }

  if (addresses.length === 0) {
    throw new SsrfBlockedError(
      "DNS_RESOLUTION_FAILED",
      `"${hostname}" resolved to no addresses.`,
    );
  }

  // Every returned address must be public. If ANY is private, the whole host
  // is refused: a split-horizon or deliberately poisoned record that mixes a
  // public and a private answer should not be connectable at all.
  const blocked = addresses
    .map((entry) => ({ entry, label: describeBlockedAddress(entry.address) }))
    .filter((item) => item.label !== null);

  if (blocked.length > 0) {
    const first = blocked[0];
    throw new SsrfBlockedError(
      "ADDRESS_NOT_PUBLIC",
      `Refused "${hostname}": it resolves to ${first?.entry.address} (${first?.label}). ` +
        "A hostname resolving to a non-public address is never contacted.",
    );
  }

  const chosen = addresses[0];
  if (!chosen) {
    throw new SsrfBlockedError("DNS_RESOLUTION_FAILED", `"${hostname}" produced no usable address.`);
  }

  return {
    url,
    hostname,
    pinnedAddress: chosen.address,
    addressFamily: chosen.family === 4 ? 4 : 6,
    port,
  };
}

/** Normalise and resolve in one step. Used for every hop, including redirects. */
export async function validateOutboundTarget(input: string): Promise<ValidatedTarget> {
  return resolveAndPin(normalizeOutboundUrl(input));
}
