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
  OIDC_TOKEN_RESOURCE_PARAM,
  OidcNonceValidationError,
  PKCE_ProofKeyManager,
  oidcScopeSchema,
  parseOAuth2State,
  parseOidcNonce,
} from "@schemavaults/auth-common";
import { SchemaVaultsAppRegistry, type ServerlessDatabase } from "@/lib/auth-db";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";
import {
  oidcAuthorizeDirectError,
  oidcAuthorizeErrorRedirect,
} from "./oidc-errors";
import isValidUrl from "@/lib/is-valid-url";
import captureServerException from "@/lib/captureServerException";
import {
  resolveAuthorizationCodeGrant,
  type ResolvedAuthorizationCodeGrant,
} from "@/lib/oauth2/api-scopes";

export interface ValidatedOidcAuthorizeRequest {
  client_app_id: AppId;
  redirect_uri: string;
  /**
   * Granted scopes, space-delimited. Empty for a plain OAuth 2.1
   * authorization grant (no `scope`, or none of the supported scopes
   * requested): no id_token is minted for it and the bridge URL carries
   * no `scope`. Contains "openid" iff this is an OpenID Connect
   * authentication request. Also holds the requested API scopes of the
   * API server `resource` names, if any.
   */
  scope: string;
  /**
   * The RFC 8707 `resource` whose API scopes `scope` holds; null when it
   * holds none (no usable `resource`, or no API scope requested).
   */
  resource: string | null;
  /**
   * `prompt=none` (OIDC Core §3.1.2.1): answer without any UI — a code when
   * the user is signed in and nothing needs their consent, else an error.
   */
  prompt_none: boolean;
  /** `prompt=consent`: show the consent screen even if nothing new is asked for. */
  prompt_consent: boolean;
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
    await captureServerException(dbh.db, e, {
      op_name: "validateOidcAuthorizeRequest.getApp",
      route: "/api/oidc/authorize",
      context: { client_app_id },
    });
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

  // `scope` is OPTIONAL (RFC 6749 §3.3). With `openid` this is an OIDC
  // authentication request; without it (absent, empty, or naming only
  // scopes this server does not know) it is a plain OAuth 2.1
  // authorization grant — access + refresh tokens, no id_token — which
  // is what OAuth-only clients (e.g. MCP clients) send. Only a
  // malformed value is an error: it must not be silently reinterpreted
  // as "no scope".
  const raw_scope: string | null = searchParams.get("scope");
  if (
    raw_scope !== null &&
    raw_scope.length > 0 &&
    !oidcScopeSchema.safeParse(raw_scope).success
  ) {
    return redirectError("invalid_scope", "Malformed 'scope' parameter.");
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

  // `prompt` (OIDC Core §3.1.2.1) is a space-delimited list. `none` must
  // stand alone; it is answered by the endpoint without any UI. `consent`
  // forces the consent screen; other values (`login`, `select_account`)
  // are ignored.
  const prompts: string[] = (searchParams.get("prompt") ?? "")
    .split(" ")
    .filter((value) => value.length > 0);
  const prompt_none: boolean = prompts.includes("none");
  if (prompt_none && prompts.length > 1) {
    return redirectError(
      "invalid_request",
      "prompt=none cannot be combined with other prompt values.",
    );
  }
  const prompt_consent: boolean = prompts.includes("consent");

  // RFC 8707 `resource`: a single value naming an API server this client
  // may use lets the request ask for the scopes that API server defines.
  // Anything else is ignored, as this endpoint always ignored `resource`
  // (the token endpoint still answers `invalid_target` for it): the grant
  // then holds the supported OIDC scopes only.
  let resolved_grant: ResolvedAuthorizationCodeGrant;
  try {
    resolved_grant = await resolveAuthorizationCodeGrant({
      dbh,
      client_app_id,
      uid: null,
      nonce: null,
      scope: raw_scope !== null && raw_scope.length > 0 ? raw_scope : null,
      resource: searchParams.getAll(OIDC_TOKEN_RESOURCE_PARAM),
      environment,
    });
  } catch (e: unknown) {
    console.error(
      `[validateOidcAuthorizeRequest] Failed to resolve the requested scopes of '${client_app_id}':`,
      e,
    );
    await captureServerException(dbh.db, e, {
      op_name: "validateOidcAuthorizeRequest.resolveAuthorizationCodeGrant",
      route: "/api/oidc/authorize",
      context: { client_app_id },
    });
    return redirectError("server_error", "Failed to resolve the requested scopes.");
  }

  return {
    kind: "ok",
    request: {
      client_app_id,
      redirect_uri,
      // What the flow asks for (consent is per user, asked by the login UI).
      scope: resolved_grant.requested_scope ?? "",
      resource: resolved_grant.resource,
      prompt_none,
      prompt_consent,
      state,
      nonce,
      code_challenge: parsed_code_challenge.data,
    },
  };
}

export default validateOidcAuthorizeRequest;
