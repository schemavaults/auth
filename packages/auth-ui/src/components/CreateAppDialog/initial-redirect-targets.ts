import {
  canonicalAppDomain,
  initialAppCallbackUrlSchema,
  initialAppDomainSchema,
  type InitialAppCallbackUrl,
  type InitialAppDomain,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

/**
 * What the create app form's "Domains and callback URLs" section holds:
 * the raw input rows (blank rows are ignored) and the one environment
 * they are registered for.
 */
export interface InitialRedirectTargetsValue {
  environment: SchemaVaultsAppEnvironment;
  domains: readonly string[];
  callback_urls: readonly string[];
}

/** Per-row error messages, index-aligned with the value's rows. */
export interface InitialRedirectTargetsErrors {
  domains: readonly (string | undefined)[];
  callback_urls: readonly (string | undefined)[];
}

export type BuildInitialRedirectTargetsResult =
  | {
      ok: true;
      initial_domains: InitialAppDomain[];
      initial_callback_urls: InitialAppCallbackUrl[];
    }
  | { ok: false; errors: InitialRedirectTargetsErrors };

export function emptyInitialRedirectTargets(
  environment: SchemaVaultsAppEnvironment,
): InitialRedirectTargetsValue {
  return { environment, domains: [""], callback_urls: [""] };
}

/** Whether at least one (non-blank) callback URL was entered. */
export function hasInitialCallbackUrl(
  value: InitialRedirectTargetsValue,
): boolean {
  return value.callback_urls.some((url) => url.trim().length > 0);
}

/**
 * Validate the rows with the same schemas `POST /api/apps` applies and,
 * when all are valid, return the request's `initial_domains` /
 * `initial_callback_urls`. Blank rows are skipped; a repeated value is an
 * error on its second occurrence.
 */
export function buildInitialRedirectTargets(
  value: InitialRedirectTargetsValue,
): BuildInitialRedirectTargetsResult {
  const { environment } = value;
  const initial_domains: InitialAppDomain[] = [];
  const initial_callback_urls: InitialAppCallbackUrl[] = [];
  let failed = false;

  const seenDomains = new Set<string>();
  const domainErrors = value.domains.map((raw): string | undefined => {
    const domain = raw.trim();
    if (domain.length === 0) return undefined;
    const parsed = initialAppDomainSchema.safeParse({ domain, environment });
    if (!parsed.success) {
      failed = true;
      return parsed.error.issues[0]?.message ?? "Invalid domain";
    }
    if (seenDomains.has(canonicalAppDomain(domain))) {
      failed = true;
      return "This domain is already listed";
    }
    seenDomains.add(canonicalAppDomain(domain));
    initial_domains.push(parsed.data);
    return undefined;
  });

  const seenCallbackUrls = new Set<string>();
  const callbackUrlErrors = value.callback_urls.map(
    (raw): string | undefined => {
      const callback_url = raw.trim();
      if (callback_url.length === 0) return undefined;
      const parsed = initialAppCallbackUrlSchema.safeParse({
        callback_url,
        environment,
      });
      if (!parsed.success) {
        failed = true;
        return parsed.error.issues[0]?.message ?? "Invalid callback URL";
      }
      if (seenCallbackUrls.has(callback_url)) {
        failed = true;
        return "This callback URL is already listed";
      }
      seenCallbackUrls.add(callback_url);
      initial_callback_urls.push(parsed.data);
      return undefined;
    },
  );

  if (failed) {
    return {
      ok: false,
      errors: { domains: domainErrors, callback_urls: callbackUrlErrors },
    };
  }
  return { ok: true, initial_domains, initial_callback_urls };
}

/**
 * Origins of the entered http(s) callback URLs that are not listed as
 * domains yet. A web app usually needs its callback URL's origin as a
 * domain too (CORS for the token exchange), so the form offers to add
 * them.
 */
export function suggestedDomainsForCallbackUrls(
  value: InitialRedirectTargetsValue,
): string[] {
  const listed = new Set(
    value.domains.map((d) => canonicalAppDomain(d.trim())).filter((d) => d.length > 0),
  );
  const suggestions: string[] = [];
  for (const raw of value.callback_urls) {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (listed.has(url.origin) || suggestions.includes(url.origin)) continue;
    suggestions.push(url.origin);
  }
  return suggestions;
}
