import "server-only";
import { z } from "zod";
import {
  apiServerIdSchema,
  getApiServerIdForTokenAudience,
  getAppEnvironment,
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { createAudienceSchema, isResourceUrlAudience } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import UnresolvableTokenResourceError from "@/lib/error/UnresolvableTokenResourceError";
import requireApiServerDomainVerification from "@/lib/config/require-api-server-domain-verification";
import { findApiServersMatchingResourceUrl } from "./find-api-servers-matching-resource-url";

/**
 * A token audience resolved to the API server that will verify tokens
 * minted for it.
 */
export type ResolvedTokenAudience =
  | {
      kind: "auth-server";
      /** The auth server URL. */
      token_audience: string;
      /** The auth server's own app id (its keyset id). */
      api_server_id: ApiServerId;
      api_server: null;
    }
  | {
      kind: "api-server-id";
      /** The API server id verbatim. */
      token_audience: string;
      api_server_id: ApiServerId;
      /** Loaded lazily by the caller when it needs the server's policy. */
      api_server: SchemaVaultsApiServerDefinition | null;
    }
  | {
      kind: "resource-url";
      /** The RFC 8707 resource URL exactly as the client sent it. */
      token_audience: string;
      /** The API server whose registered domain matched the URL. */
      api_server_id: ApiServerId;
      api_server: SchemaVaultsApiServerDefinition;
    };

/**
 * @description Finds the API server whose registered domain matches an RFC
 * 8707 resource URL in the given environment, honouring each API server's
 * `resource_url_match_mode` (see `findApiServersMatchingResourceUrl()`).
 *
 * Domain registrations whose ownership is VERIFIED
 * (`lib/api-server-domain-verification/`) come first: when any API server
 * has a verified domain matching the URL, unverified registrations are
 * ignored, so a registration of someone else's domain can neither make it
 * ambiguous nor capture it. Only when no verified domain matches, and while
 * the `require_api_server_domain_verification` server setting is off (the
 * transition default), the URL falls back to every registration, as before
 * domains could be verified; with the setting on it does not resolve.
 *
 * @throws UnresolvableTokenResourceError when no API server matches, or
 * when more than one does (the resource would be ambiguous).
 */
export async function resolveResourceUrlToApiServer(
  db: Kysely<AuthDatabase>,
  resource_url: string,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  debug: boolean = false,
): Promise<Extract<ResolvedTokenAudience, { kind: "resource-url" }>> {
  let origin: string;
  try {
    origin = new URL(resource_url).origin;
  } catch {
    throw new UnresolvableTokenResourceError(resource_url, "unknown");
  }
  if (origin === "null" || origin.length === 0) {
    throw new UnresolvableTokenResourceError(resource_url, "unknown");
  }

  let matched_api_server_ids: Set<ApiServerId> = await findApiServersMatchingResourceUrl(db, {
    resource_url,
    origin,
    environment,
    registrations: "verified",
  });
  let matched_through: "verified" | "any" = "verified";
  if (matched_api_server_ids.size === 0) {
    if (!(await requireApiServerDomainVerification(db))) {
      matched_api_server_ids = await findApiServersMatchingResourceUrl(db, {
        resource_url,
        origin,
        environment,
        registrations: "any",
      });
      matched_through = "any";
    }
  }

  if (debug) {
    console.log(
      `[resolveResourceUrlToApiServer] '${resource_url}' (${environment}) matched API servers through ${matched_through} domains: `,
      [...matched_api_server_ids],
    );
  }

  if (matched_api_server_ids.size === 0) {
    throw new UnresolvableTokenResourceError(resource_url, "unknown");
  }
  if (matched_api_server_ids.size > 1) {
    throw new UnresolvableTokenResourceError(resource_url, "ambiguous");
  }
  const api_server_id: ApiServerId = [...matched_api_server_ids][0]!;

  const api_server = await new SchemaVaultsApiServerRegistry(
    db,
    debug,
  ).getApiServer(api_server_id);
  if (!api_server) {
    throw new UnresolvableTokenResourceError(resource_url, "unknown");
  }

  return {
    kind: "resource-url",
    token_audience: resource_url,
    api_server_id,
    api_server,
  };
}

/**
 * @description Resolves a (schema-valid) token audience — the auth server
 * URL, an API server id, or an RFC 8707 resource URL — to the API server
 * that owns it. Ids are not verified to exist here (the app-to-API
 * permission check that follows fails for unknown ids as it always has);
 * URLs are resolved through the API servers' registered domains.
 *
 * @throws TypeError for a value the audience schema rejects.
 * @throws UnresolvableTokenResourceError for a URL no (or more than one)
 * API server has registered.
 */
export async function resolveTokenAudience(
  db: Kysely<AuthDatabase>,
  audience: string,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  debug: boolean = false,
): Promise<ResolvedTokenAudience> {
  const parsed = createAudienceSchema(z, environment).safeParse(audience);
  if (!parsed.success) {
    throw new TypeError(`Invalid token audience: '${audience}'`, {
      cause: parsed.error,
    });
  }
  const value: string = parsed.data;
  const auth_app_id: ApiServerId = getAuthServerAppId();

  if (
    value === auth_app_id ||
    getApiServerIdForTokenAudience(value, environment) === auth_app_id
  ) {
    return {
      kind: "auth-server",
      token_audience: value,
      api_server_id: auth_app_id,
      api_server: null,
    };
  }

  if (isResourceUrlAudience(value, environment)) {
    return await resolveResourceUrlToApiServer(db, value, environment, debug);
  }

  const id = apiServerIdSchema.safeParse(value);
  if (!id.success) {
    throw new TypeError(`Unhandled token audience form: '${audience}'`);
  }
  return {
    kind: "api-server-id",
    token_audience: id.data,
    api_server_id: id.data,
    api_server: null,
  };
}

export default resolveTokenAudience;
