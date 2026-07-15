import "server-only";
import type { NextResponse } from "next/server";
import {
  appIdSchema,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsApp,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  OAuth2StateValidationError,
  OidcNonceValidationError,
  PKCE_ProofKeyManager,
  parseAndGrantScopes,
  parseOAuth2State,
  parseOidcNonce,
  serializeOidcScopes,
} from "@schemavaults/auth-common";
import { SchemaVaultsAppRegistry, type ServerlessDatabase } from "@/lib/auth-db";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";
import {
  oidcAuthorizeDirectError,
  oidcAuthorizeErrorRedirect,
} from "./oidc-errors";
import isValidUrl from "@/lib/is-valid-url";

export interface ValidatedOidcAuthorizeRequest {
  client_app_id: AppId;
  redirect_uri: string;
  /** Granted scopes, space-delimited (always contains "openid"). */
  scope: string;
  state: string | null;
  nonce: string | null;
  code_challenge: string;
}

export type OidcAuthorizeValidationResult =
  | { kind: "response"; response: NextResponse }
  | { kind: "ok"; request: ValidatedOidcAuthorizeRequest };

/**
 * Validates a GET /api/oidc/authorize request per RFC 6749 §4.1.1 /
 * OIDC Core §3.1.2.1-§3.1.2.2.
 *
 * Ordering is load-bearing: `client_id` and `redirect_uri` are checked
 * first and their failures return a direct 400 (never a redirect); all
 * later failures redirect back to the now-trusted redirect_uri with a
 * spec error code.
 */
export async function validateOidcAuthorizeRequest(
  searchParams: URLSearchParams,
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): Promise<OidcAuthorizeValidationResult> {
  // --- Stage 1: client_id + redirect_uri (no-redirect failures) -----
  const raw_client_id = searchParams.get("client_id");
  const parsed_client_id = appIdSchema.safeParse(raw_client_id);
  if (!parsed_client_id.success) {
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "invalid_request",
        "Missing or malformed 'client_id' parameter.",
      ),
    };
  }
  const client_app_id: AppId = parsed_client_id.data;

  let app: SchemaVaultsApp | null;
  try {
    const registry = new SchemaVaultsAppRegistry(dbh.db);
    app = await registry.getApp(client_app_id);
  } catch (e: unknown) {
    console.error(
      `[validateOidcAuthorizeRequest] Failed to load app '${client_app_id}':`,
      e,
    );
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "server_error",
        "Failed to load the client application.",
      ),
    };
  }
  if (!app) {
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "invalid_request",
        "Unknown 'client_id'.",
      ),
    };
  }
  if (!app.web) {
    // The OIDC surface only supports browser-redirect delivery; the
    // native-app JSON-POST callback of the custom surface is out of
    // scope for spec-compliant RPs.
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "unauthorized_client",
        "This client application is not registered for web redirect flows.",
      ),
    };
  }

  const redirect_uri = searchParams.get("redirect_uri");
  if (typeof redirect_uri !== "string" || redirect_uri.length === 0) {
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "invalid_request",
        "Missing 'redirect_uri' parameter.",
      ),
    };
  } else if (!isValidUrl(redirect_uri)) {
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "invalid_request",
        "Invalid URL for 'redirect_uri' parameter.",
      ),
    };
  }
  const redirectUriAllowed: boolean = await isRedirectUriRegisteredForClientApp(
    {
      redirect_uri,
      client_app_id,
      environment,
      dbh,
    },
  );
  if (!redirectUriAllowed) {
    return {
      kind: "response",
      response: oidcAuthorizeDirectError(
        "invalid_request",
        "The 'redirect_uri' is not registered for this client application.",
      ),
    };
  }

  // --- Stage 2: state (malformed state gets a 400 without echo) -----
  let state: string | null;
  try {
    state = parseOAuth2State(searchParams.get("state") ?? undefined);
  } catch (e: unknown) {
    if (e instanceof OAuth2StateValidationError) {
      return {
        kind: "response",
        response: oidcAuthorizeDirectError(
          "invalid_request",
          "Malformed 'state' parameter.",
        ),
      };
    }
    throw e;
  }

  // --- Stage 3: redirecting errors (redirect_uri is now trusted) ----
  const redirectError = (
    error: Parameters<typeof oidcAuthorizeErrorRedirect>[1],
    description: string,
  ): OidcAuthorizeValidationResult => ({
    kind: "response",
    response: oidcAuthorizeErrorRedirect(
      redirect_uri,
      error,
      description,
      state,
    ),
  });

  if (searchParams.get("request") !== null) {
    return redirectError(
      "request_not_supported",
      "The 'request' (JAR) parameter is not supported.",
    );
  }
  if (searchParams.get("request_uri") !== null) {
    return redirectError(
      "request_uri_not_supported",
      "The 'request_uri' parameter is not supported.",
    );
  }

  const response_type = searchParams.get("response_type");
  if (response_type !== "code") {
    return redirectError(
      "unsupported_response_type",
      "Only response_type=code is supported.",
    );
  }

  const { granted, hasOpenid } = parseAndGrantScopes(
    searchParams.get("scope") ?? undefined,
  );
  if (!hasOpenid) {
    return redirectError(
      "invalid_scope",
      "The 'scope' parameter must include 'openid'.",
    );
  }

  let nonce: string | null;
  try {
    nonce = parseOidcNonce(searchParams.get("nonce") ?? undefined);
  } catch (e: unknown) {
    if (e instanceof OidcNonceValidationError) {
      return redirectError("invalid_request", "Malformed 'nonce' parameter.");
    }
    throw e;
  }

  // PKCE is mandatory: every client on this surface is a public client.
  const code_challenge_method = searchParams.get("code_challenge_method");
  if (code_challenge_method !== "S256") {
    return redirectError(
      "invalid_request",
      "PKCE is required: 'code_challenge_method' must be 'S256'.",
    );
  }
  const raw_code_challenge = searchParams.get("code_challenge");
  const parsed_code_challenge =
    PKCE_ProofKeyManager.codeChallengeSchema.safeParse(raw_code_challenge);
  if (!parsed_code_challenge.success) {
    return redirectError(
      "invalid_request",
      "PKCE is required: missing or malformed 'code_challenge'.",
    );
  }

  // `prompt=none` demands a guaranteed no-UI flow; the bridge may need
  // to render login or consent, so report the spec error instead.
  if (searchParams.get("prompt") === "none") {
    return redirectError(
      "login_required",
      "Silent authentication (prompt=none) is not supported.",
    );
  }

  return {
    kind: "ok",
    request: {
      client_app_id,
      redirect_uri,
      scope: serializeOidcScopes(granted),
      state,
      nonce,
      code_challenge: parsed_code_challenge.data,
    },
  };
}

export default validateOidcAuthorizeRequest;
