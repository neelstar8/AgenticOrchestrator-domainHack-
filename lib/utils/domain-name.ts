/**
 * Domain-name normalisation and candidate generation.
 *
 * Normalisation exists so deduplication is reliable: `HTTPS://Quotex.COM./path`
 * and `quotex.com` must collapse to one registry record.
 *
 * Candidate generation deliberately produces a BOUNDED list of plausible
 * variations to verify. It does not and cannot enumerate every possible domain,
 * and an unverified candidate is never treated as an existing website.
 */

/** Public suffixes Sentinel recognises as multi-label. Not the full PSL. */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.in",
  "com.in",
  "net.in",
  "org.in",
  "firm.in",
  "gen.in",
  "ind.in",
  "co.uk",
  "org.uk",
  "me.uk",
  "com.au",
  "net.au",
  "com.br",
  "com.sg",
  "com.my",
  "co.za",
  "com.ng",
  "co.ke",
  "com.pk",
  "com.bd",
  "com.np",
  "com.tr",
  "co.jp",
  "co.kr",
  "com.cn",
  "com.hk",
  "com.tw",
  "com.mx",
  "com.ar",
  "com.co",
  "com.ph",
  "com.vn",
]);

export interface NormalizedDomain {
  /** Lowercased, trailing-dot-stripped, punycode (ASCII) hostname. */
  fqdn: string;
  /** Same as fqdn; kept separate so a future PSL change cannot silently alter dedup keys. */
  normalizedDomain: string;
  /** Registrable domain (effective TLD + 1 label). */
  registrableDomain: string;
  /** Public suffix, e.g. "com" or "com.in". */
  suffix: string;
  /** Subdomain labels below the registrable domain, outermost first. */
  subdomainLabels: string[];
  /** True when the input contained non-ASCII labels that were punycoded. */
  wasInternationalised: boolean;
}

export class DomainParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainParseError";
  }
}

const HOSTNAME_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const NON_ASCII_PATTERN = /[^ -~]/;

/**
 * Extracts a hostname from a bare domain or an http(s) URL.
 * Rejects every other protocol so a `file:` or `gopher:` string can never
 * become a registry entry.
 */
export function extractHostname(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new DomainParseError("Domain is empty.");
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new DomainParseError(`"${input}" is not a valid URL.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new DomainParseError(
        `Only http and https URLs are supported; received "${url.protocol}".`,
      );
    }
    if (url.hostname === "") {
      throw new DomainParseError(`"${input}" has no hostname.`);
    }
    return url.hostname;
  }

  // Tolerate a protocol-relative or path-bearing bare host like "quotex.com/a".
  const hostPart = trimmed.replace(/^\/\//, "").split("/")[0] ?? "";
  // Strip any credentials and port.
  const withoutCredentials = hostPart.includes("@")
    ? (hostPart.split("@").pop() ?? "")
    : hostPart;
  const withoutPort = withoutCredentials.replace(/:\d+$/, "");
  if (withoutPort === "") {
    throw new DomainParseError(`"${input}" has no hostname.`);
  }
  return withoutPort;
}

export function normalizeDomain(input: string): NormalizedDomain {
  const hostname = extractHostname(input);

  // `new URL` already punycodes, but a bare hostname has to be converted here.
  const lowered = hostname.toLowerCase().replace(/\.+$/, "");
  const wasInternationalised = NON_ASCII_PATTERN.test(lowered);
  let ascii: string;
  if (wasInternationalised) {
    try {
      ascii = new URL(`https://${lowered}`).hostname;
    } catch {
      throw new DomainParseError(`"${input}" could not be converted to a punycode hostname.`);
    }
  } else {
    ascii = lowered;
  }

  if (ascii.includes("..")) {
    throw new DomainParseError(`"${input}" contains an empty domain label.`);
  }

  // Reject bare IP literals: they are hosts, not registrable domains.
  if (/^\d+(\.\d+){3}$/.test(ascii) || ascii.startsWith("[")) {
    throw new DomainParseError(
      `"${input}" is an IP address. Sentinel's registry stores domain names.`,
    );
  }

  const labels = ascii.split(".");
  if (labels.length < 2) {
    throw new DomainParseError(
      `"${input}" is not a fully qualified domain name (it has no public suffix).`,
    );
  }
  for (const label of labels) {
    if (!HOSTNAME_LABEL_PATTERN.test(label)) {
      throw new DomainParseError(`"${input}" contains an invalid domain label: "${label}".`);
    }
  }

  const lastTwo = labels.slice(-2).join(".");
  const suffix = MULTI_LABEL_SUFFIXES.has(lastTwo) ? lastTwo : (labels.at(-1) as string);
  const suffixLabelCount = suffix.split(".").length;

  if (labels.length <= suffixLabelCount) {
    throw new DomainParseError(
      `"${input}" is a public suffix ("${suffix}") with no registrable label.`,
    );
  }

  const registrableLabels = labels.slice(-(suffixLabelCount + 1));
  const registrableDomain = registrableLabels.join(".");
  const subdomainLabels = labels.slice(0, labels.length - registrableLabels.length);

  return {
    fqdn: ascii,
    normalizedDomain: ascii,
    registrableDomain,
    suffix,
    subdomainLabels,
    wasInternationalised,
  };
}

/** Returns the normalised form, or null instead of throwing. */
export function tryNormalizeDomain(input: string): NormalizedDomain | null {
  try {
    return normalizeDomain(input);
  } catch {
    return null;
  }
}

/** The brand label of a domain: the registrable name without its suffix. */
export function brandLabel(registrableDomain: string, suffix: string): string {
  return registrableDomain.endsWith(`.${suffix}`)
    ? registrableDomain.slice(0, -(suffix.length + 1))
    : registrableDomain;
}

const COMMON_SUFFIXES = [
  "com",
  "net",
  "org",
  "io",
  "co",
  "info",
  "biz",
  "online",
  "site",
  "app",
  "trade",
  "co.in",
  "com.in",
  "net.in",
  "org.in",
  "in",
];

const COMMON_SUBDOMAIN_PREFIXES = [
  "www",
  "app",
  "login",
  "my",
  "trade",
  "trading",
  "platform",
  "broker",
  "signup",
  "register",
  "promo",
  "partner",
  "affiliate",
  "m",
  "mobile",
  "api",
  "cabinet",
  "client",
];

const CHARACTER_CONFUSIONS: Array<[string, string]> = [
  ["o", "0"],
  ["l", "1"],
  ["i", "1"],
  ["e", "3"],
  ["a", "4"],
  ["s", "5"],
  ["g", "9"],
];

export type CandidateKind =
  | "suffix-swap"
  | "subdomain"
  | "hyphenation"
  | "character-confusion"
  | "label-affix"
  | "label-repeat";

export interface DomainCandidate {
  fqdn: string;
  kind: CandidateKind;
  /** Why this candidate was generated, for the evidence trail. */
  rationale: string;
}

export interface GenerateCandidatesOptions {
  /** Hard cap. Generation is bounded by design. */
  limit?: number;
  includeSubdomains?: boolean;
  includeSuffixSwaps?: boolean;
  includeTypoVariants?: boolean;
}

/**
 * Generates a bounded, deterministic list of candidate domains to VERIFY.
 *
 * Important: the returned list is a search space, not a claim. Each candidate
 * must be independently checked before it means anything, and the caller is
 * responsible for recording unchecked candidates as unchecked.
 */
export function generateDomainCandidates(
  seed: string,
  options: GenerateCandidatesOptions = {},
): DomainCandidate[] {
  const {
    limit = 60,
    includeSubdomains = true,
    includeSuffixSwaps = true,
    includeTypoVariants = true,
  } = options;

  const normalized = normalizeDomain(seed);
  const brand = brandLabel(normalized.registrableDomain, normalized.suffix);
  const candidates = new Map<string, DomainCandidate>();

  const add = (fqdn: string, kind: CandidateKind, rationale: string) => {
    if (candidates.size >= limit) return;
    const parsed = tryNormalizeDomain(fqdn);
    if (!parsed) return;
    if (parsed.fqdn === normalized.fqdn) return;
    if (candidates.has(parsed.fqdn)) return;
    candidates.set(parsed.fqdn, { fqdn: parsed.fqdn, kind, rationale });
  };

  if (includeSuffixSwaps) {
    for (const suffix of COMMON_SUFFIXES) {
      if (suffix === normalized.suffix) continue;
      add(
        `${brand}.${suffix}`,
        "suffix-swap",
        `Same brand label "${brand}" under the .${suffix} public suffix.`,
      );
    }
  }

  if (includeSubdomains) {
    for (const prefix of COMMON_SUBDOMAIN_PREFIXES) {
      add(
        `${prefix}.${normalized.registrableDomain}`,
        "subdomain",
        `Common "${prefix}" subdomain prefix on the seed registrable domain.`,
      );
    }
  }

  if (includeTypoVariants) {
    if (brand.length > 3) {
      for (let i = 1; i < brand.length; i += 1) {
        add(
          `${brand.slice(0, i)}-${brand.slice(i)}.${normalized.suffix}`,
          "hyphenation",
          `Hyphenated form of the brand label at position ${i}.`,
        );
      }
    }

    for (const [from, to] of CHARACTER_CONFUSIONS) {
      if (!brand.includes(from)) continue;
      add(
        `${brand.replaceAll(from, to)}.${normalized.suffix}`,
        "character-confusion",
        `Visually confusable substitution "${from}" to "${to}" in the brand label.`,
      );
    }

    for (const affix of ["official", "india", "login", "app", "trade", "global", "pro"]) {
      add(
        `${brand}-${affix}.${normalized.suffix}`,
        "label-affix",
        `Brand label combined with the common affix "${affix}".`,
      );
      add(
        `${brand}${affix}.${normalized.suffix}`,
        "label-affix",
        `Brand label concatenated with the common affix "${affix}".`,
      );
    }

    if (brand.length > 2) {
      const doubled = brand.slice(0, 1) + brand.slice(0, 1) + brand.slice(1);
      add(
        `${doubled}.${normalized.suffix}`,
        "label-repeat",
        "Repeated leading character, a common typing slip.",
      );
    }
  }

  return [...candidates.values()];
}

/**
 * Normalised Damerau-Levenshtein similarity, 0-100.
 *
 * This is a lexical signal for triage ordering. It says nothing about ownership,
 * affiliation or legality.
 */
export function stringSimilarityScore(a: string, b: string): number {
  if (a === b) return 100;
  if (a.length === 0 || b.length === 0) return 0;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dist[i]![0] = i;
  for (let j = 0; j < cols; j += 1) dist[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        dist[i - 1]![j]! + 1,
        dist[i]![j - 1]! + 1,
        dist[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, dist[i - 2]![j - 2]! + 1);
      }
      dist[i]![j] = value;
    }
  }

  const distance = dist[a.length]![b.length]!;
  const maxLength = Math.max(a.length, b.length);
  return Math.round((1 - distance / maxLength) * 100);
}

/**
 * Brand-similarity signal between a candidate domain and a brand name.
 * Combines a containment check with lexical distance on the brand label.
 */
export function brandSimilarity(candidateFqdn: string, brandName: string): number {
  const parsed = tryNormalizeDomain(candidateFqdn);
  if (!parsed) return 0;

  const brandToken = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (brandToken === "") return 0;

  const label = brandLabel(parsed.registrableDomain, parsed.suffix).replace(/[^a-z0-9]/g, "");
  const allLabels = parsed.fqdn.replace(/[^a-z0-9]/g, "");

  if (label === brandToken) return 100;
  const lexical = stringSimilarityScore(label, brandToken);
  if (label.includes(brandToken)) return Math.max(88, lexical);
  if (allLabels.includes(brandToken)) return Math.max(72, lexical);
  return lexical;
}
