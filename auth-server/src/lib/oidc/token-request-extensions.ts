import "server-only";
import { z } from "zod";
import {
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  createAudienceSchema,
  DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  OIDC_TOKEN_RESOURCE_PARAM,
  oidcRefreshTokenDeliveryModeSchema,
  type OidcRefreshTokenDeliveryMode,
} from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import validateAudience from "@/lib/validate-audience";
import ClientApplicationNotAuthorizedByUser from "@/lib/error/ClientApplicationNotAuthorizedByUser";
import AppNotConnectedToApiServerError from "@/lib/error/AppNotConnectedToApiServerError";
import type { OidcTokenErrorCode } from "./oidc-errors";

/**
 * Token-endpoint request extensions used by the SchemaVaults SDKs on top
 * of the standard OIDC surface (see `token-endpoint-extensions.ts` in
 * `@schemavaults/auth-common` for the wire contract):
 *
 *   - RFC 8707 `resource`: mint the access token for a registered API
 *     server / the auth server itself instead of the reserved
 *     `oidc-userinfo` audience.
 *   - `refresh_token_delivery`: deliver the refresh token as an HTTP-only
 *     cookie instead of inlining it in the JSON body.
 */

export interface OidcTokenRequestError {
  error: OidcTokenErrorCode;
  error_description: string;
}

export type ParsedOidcTokenResource =
  | { ok: true; resource: string | null }
  | { ok: false; error: OidcTokenRequestError };

/**
 * Reads the RFC 8707 `resource` parameter(s) off the token request form.
 *
 * Absent → `null` (plain OIDC behavior: userinfo-audience access token).
 * One value → validated against the platform's audience schema (the auth
 * server URL, or an API server id; the bare auth app id is rejected, as
 * everywhere else). More than one → `invalid_target`: the platform
 * issues one encrypted access token per audience, so it "only supports
 * issuing an access token with a single audience" (RFC 8707 §2) and the
 * client must send one token request per resource.
 */
export function parseOidcTokenResourceParam(
  form: FormData,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): ParsedOidcTokenResource {
  const values: string[] = form
    .getAll(OIDC_TOKEN_RESOURCE_PARAM)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (values.length === 0) {
    return { ok: true, resource: null };
  }
  if (values.length > 1) {
    return {
      ok: false,
      error: {
        error: "invalid_target",
        error_description:
          "This authorization server issues one access token per token request; send a single 'resource' parameter.",
      },
    };
  }

  const parsed = createAudienceSchema(z, environment).safeParse(values[0]);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        error: "invalid_target",
        error_description:
          "The 'resource' parameter must be the auth server URL or a registered API server id.",
      },
    };
  }
  return { ok: true, resource: parsed.data };
}

export interface ValidateOidcTokenResourceOptions {
  uid: string;
  client_app_id: AppId;
  /** Token-audience form (auth server URL or API server id). */
  resource: string;
  dbh: ServerlessDatabase;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

/**
 * Authorizes a `resource` for the (user, client) pair with the same rules
 * the platform token endpoints use for `audience`: the user must have
 * authorized the client app, the client app must be connected to the
 * API server, and only the auth server's own app may request auth-server
 * audience tokens. Returns `null` when the resource is allowed.
 */
export async function validateOidcTokenResource({
  uid,
  client_app_id,
  resource,
  dbh,
  environment,
  debug = false,
}: ValidateOidcTokenResourceOptions): Promise<OidcTokenRequestError | null> {
  try {
    const allowed: boolean = await validateAudience(
      uid,
      client_app_id,
      resource,
      dbh,
      environment,
      debug,
    );
    if (!allowed) {
      return {
        error: "invalid_target",
        error_description:
          "The requested 'resource' is not available to this client.",
      };
    }
    return null;
  } catch (e: unknown) {
    if (e instanceof ClientApplicationNotAuthorizedByUser) {
      return {
        error: "invalid_grant",
        error_description:
          "The user has not authorized this client application.",
      };
    }
    if (e instanceof AppNotConnectedToApiServerError) {
      return {
        error: "invalid_target",
        error_description:
          "The client application is not connected to the requested API server.",
      };
    }
    if (e instanceof TypeError) {
      // validateAudience rejects malformed audiences with a TypeError.
      return {
        error: "invalid_target",
        error_description: "Malformed 'resource' parameter.",
      };
    }
    throw e;
  }
}

export type ParsedOidcRefreshTokenDelivery =
  | { ok: true; mode: OidcRefreshTokenDeliveryMode }
  | { ok: false; error: OidcTokenRequestError };

/** Reads the `refresh_token_delivery` extension parameter (default: inline). */
export function parseOidcRefreshTokenDeliveryParam(
  form: FormData,
): ParsedOidcRefreshTokenDelivery {
  const raw = form.get(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM);
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: true, mode: DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE };
  }
  const parsed = oidcRefreshTokenDeliveryModeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        error: "invalid_request",
        error_description: `Unsupported '${OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM}' value.`,
      },
    };
  }
  return { ok: true, mode: parsed.data };
}

/**
 * Decides how the refresh token leaves the token endpoint. Mirrors the
 * platform's long-standing cookie policy (`returnGeneratedTokensToUser`):
 *
 *   - the auth server's own frontend ALWAYS gets an HTTP-only cookie
 *     (its server-rendered route guards read the cookie);
 *   - other clients get a cookie only when they ask for one AND the
 *     deployment is secure (cross-site cookies require `SameSite=None;
 *     Secure`, which plain-HTTP dev/test deployments cannot set), else
 *     the token is inlined per RFC 6749 §5.1.
 */
export function resolveRefreshTokenDeliveryMode(
  client_app_id: AppId,
  requested: OidcRefreshTokenDeliveryMode,
  secure: boolean,
): OidcRefreshTokenDeliveryMode {
  if (client_app_id === getAuthServerAppId()) {
    return "http_only_cookie";
  }
  if (requested === "http_only_cookie" && secure) {
    return "http_only_cookie";
  }
  return "inline";
}
