import { z } from "zod";
import { schemaVaultsAppEnvironmentSchema } from "./app-environments";
import {
  schemaVaultsAppCallbackUrlRefSchema,
  schemaVaultsAppDefinitionSchema,
  schemaVaultsAppDomainRefSchema,
} from "./client-app-definition";

/** Most domains a client application can be created with. */
export const MAX_INITIAL_APP_DOMAINS = 10 as const;
/** Most callback URLs a client application can be created with. */
export const MAX_INITIAL_APP_CALLBACK_URLS = 20 as const;

/**
 * Whether `value` is a bare http(s) origin (`https://app.example.com`,
 * optionally with a port and a trailing slash): the shape app domains
 * are compared in (CORS `Origin`, the confidential-client `redirect_uri`
 * origin fallback). Case and an explicit default port are fine: see
 * {@link canonicalAppDomain}.
 */
export function isHttpOriginUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    // `new URL()` drops an empty "?" or "#": refuse those from the input.
    !value.includes("?") &&
    !value.includes("#")
  );
}

/**
 * The canonical form of an app domain: its origin as browsers send it in
 * `Origin` (lowercase host, default port dropped, no trailing slash). An
 * unparsable value is returned as given.
 */
export function canonicalAppDomain(domain: string): string {
  try {
    const origin: string = new URL(domain).origin;
    return origin === "null" ? domain : origin;
  } catch {
    return domain;
  }
}

/** A domain to register for a new app (the server issues its ref id). */
export const initialAppDomainSchema = z
  .object({
    domain: schemaVaultsAppDomainRefSchema.shape.domain.refine(
      isHttpOriginUrl,
      "Domains must be an http(s) origin such as https://app.example.com (no path, query or fragment)",
    ),
    environment: schemaVaultsAppEnvironmentSchema,
  })
  .strict();

export type InitialAppDomain = z.infer<typeof initialAppDomainSchema>;

/** A callback URL to register for a new app (the server issues its ref id). */
export const initialAppCallbackUrlSchema = z
  .object({
    callback_url: schemaVaultsAppCallbackUrlRefSchema.shape.callback_url,
    environment: schemaVaultsAppEnvironmentSchema,
  })
  .strict();

export type InitialAppCallbackUrl = z.infer<typeof initialAppCallbackUrlSchema>;

/**
 * Body of `POST /api/apps`: the app definition plus, optionally, the
 * domains and exact callback URLs to register with it. The auth server
 * writes the app row and these in one transaction, so an app is never
 * left behind without the redirect configuration it was created with.
 *
 * Callback URLs are optional, but a public (PKCE-only) client cannot sign
 * anyone in until it has one in the environment, and a confidential
 * client without one accepts any path on its domains as a `redirect_uri`.
 */
export const schemaVaultsAppCreationRequestSchema = schemaVaultsAppDefinitionSchema
  .extend({
    initial_domains: z
      .array(initialAppDomainSchema)
      .max(MAX_INITIAL_APP_DOMAINS)
      .optional(),
    initial_callback_urls: z
      .array(initialAppCallbackUrlSchema)
      .max(MAX_INITIAL_APP_CALLBACK_URLS)
      .optional(),
  })
  .superRefine((request, ctx) => {
    reportDuplicates(
      ctx,
      "initial_domains",
      (request.initial_domains ?? []).map(
        (d) => `${d.environment} ${canonicalAppDomain(d.domain)}`,
      ),
      "This domain is listed twice for the same environment",
    );
    reportDuplicates(
      ctx,
      "initial_callback_urls",
      (request.initial_callback_urls ?? []).map(
        (c) => `${c.environment} ${c.callback_url}`,
      ),
      "This callback URL is listed twice for the same environment",
    );
  });

export type SchemaVaultsAppCreationRequest = z.infer<
  typeof schemaVaultsAppCreationRequestSchema
>;

function reportDuplicates(
  ctx: z.RefinementCtx,
  field: "initial_domains" | "initial_callback_urls",
  keys: readonly string[],
  message: string,
): void {
  const seen = new Set<string>();
  keys.forEach((key, index) => {
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", message, path: [field, index] });
    }
    seen.add(key);
  });
}
