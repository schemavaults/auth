import "server-only";
import type { ReactElement } from "react";
import redirectWithError from "@/lib/redirect-with-error";
import { redirect } from "next/navigation";
import generateAuthorizationCode from "@/lib/auth-db/users/generate-authorization-code";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import type { AppId, SchemaVaultsApp } from "@schemavaults/app-definitions";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";
import AppAuthorizationConsentScreen from "@/components/AppAuthorizationConsentScreen";
import NativeAppCodeDelivery from "@/components/NativeAppCodeDelivery";
import type ServerlessDatabase from "@/lib/auth-db/serverless-database";
import {
  OAuth2StateValidationError,
  OidcNonceValidationError,
  parseAndGrantScopes,
  parseOAuth2State,
  parseOidcNonce,
  type UserData,
} from "@schemavaults/auth-common";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import isValidOnSuccessfulAuthenticateAction from "./isValidOnSuccessfulAuthenticateAction";
import { codeChallengeSchema } from "@schemavaults/auth-common/pkce/code_challenge.js";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";

export interface AlreadyAuthenticatedOnLoginOrRegisterPageProps {
  on_successful_authenticate: OnSuccessfulAuthenticateAction;
  app: SchemaVaultsApp | null;
  debug: boolean;
  dbh: ServerlessDatabase;
  uid: UserData['uid'];
  // Safe same-origin path to return the user to for the account-page
  // flow (already validated by `resolveNextHref` upstream). Null →
  // default /account destination. Third-party flows ignore this; their
  // destination is the OAuth2 redirect_uri.
  next_href?: string | null;
  code_challenge: string | null;
  code_challenge_method: string | null;
  challenge_time_str: string | null;
  redirect_uri: string | null;
  // OAuth2 `state` (RFC 6749 §10.12) — echoed back on the callback URL
  // so the client can verify its stored CSRF nonce.
  state: string | null;
  // Login replay nonce + requested scopes (first-class on every flow).
  // A null nonce is bound as-is (OIDC RPs may omit it, OIDC Core
  // §3.1.2.1); a null/invalid scope is rejected (the entry pages already
  // gate this).
  nonce: string | null;
  scope: string | null;
}

export default async function AlreadyAuthenticatedOnLoginOrRegisterPage(
  { dbh, on_successful_authenticate, app, uid, ...opts }: AlreadyAuthenticatedOnLoginOrRegisterPageProps
): Promise<ReactElement> {
  if (!isValidOnSuccessfulAuthenticateAction(on_successful_authenticate)) {
    console.error("AlreadyAuthenticatedOnLoginOrRegisterPage received bad 'on_successful_authenticate'!")
    redirectWithError(500, "internal_server_error");
  }

  if (on_successful_authenticate === 'account-page') {
    return redirect(opts.next_href ?? "/account");
  }

  if (!app) {
    console.error("Failed to load app definition despite 'on_successful_authenticate' of: ", on_successful_authenticate);
    redirectWithError(500, "internal_server_error");
  }
  const app_id: AppId = app.app_id;

  let isAppAuthorized: boolean;
  try {
    isAppAuthorized = await isAppAuthorizedForUser(dbh.db, uid, app_id, opts.debug);
  } catch (e: unknown) {
    console.error(`[AlreadyAuthenticatedOnLoginOrRegisterPage] Failed to check if app '${app_id}' is authorized for user '${uid}': `, e);
    redirectWithError(500, "internal_server_error");
  }

  // App already authorized — generate auth code server-side and redirect immediately
  if (typeof opts.code_challenge !== 'string' || !codeChallengeSchema.safeParse(opts.code_challenge).success) {
    console.warn("Invalid code challenge!")
    redirectWithError(400, "bad_request");
  }
  const code_challenge: string = opts.code_challenge;

  if (typeof opts.challenge_time_str !== 'string') {
    console.warn("Invalid code challenge time!")
    redirectWithError(400, "bad_request");
  }
  const challenge_time_str = opts.challenge_time_str;
  const challenge_time: number = parseInt(challenge_time_str);
  if (isNaN(challenge_time)) {
    console.warn("Invalid code challenge time!")
    redirectWithError(400, "bad_request");
  }

  if (isPkceChallengeExpired(challenge_time)) {
    console.warn("PKCE challenge has expired!");
    redirectWithError(400, "pkce_challenge_expired");
  }

  if (typeof opts.redirect_uri !== 'string' || !opts.redirect_uri) {
    console.warn("Bad redirect URI!");
    redirectWithError(400, "bad_request");
  }
  const redirect_uri = opts.redirect_uri;

  // OAuth2 redirect_uri allowlist check. The redirect_uri arrived on
  // the URL untrusted; refuse to mint an authorization code unless its
  // origin is registered for this client_app_id in the current
  // environment.
  const redirectUriAllowed = await isRedirectUriRegisteredForClientApp({
    redirect_uri,
    client_app_id: app_id,
    environment: getAppEnvironment(),
    dbh,
  });
  if (!redirectUriAllowed) {
    console.warn(
      `[AlreadyAuthenticatedOnLoginOrRegisterPage] redirect_uri '${redirect_uri}' is not registered for app '${app_id}'`,
    );
    redirectWithError(400, "invalid_redirect_uri");
  }

  if (typeof opts.code_challenge_method !== 'string' || !opts.code_challenge_method || opts.code_challenge_method !== 'S256') {
    console.warn("Bad code challenge method!");
    redirectWithError(400, "bad_request");
  }
  const code_challenge_method: "S256" = opts.code_challenge_method;

  // Grant-context validation (first-class on every flow): nonce must be
  // well-formed when present (OPTIONAL per OIDC Core §3.1.2.1 — an RP may
  // omit it, so absent is bound as null), and the scope must grant at
  // least one supported scope. The entry pages already 400 on these;
  // this re-check guards direct navigations.
  let url_nonce: string | null;
  try {
    url_nonce = parseOidcNonce(opts.nonce);
  } catch (e: unknown) {
    if (e instanceof OidcNonceValidationError) {
      console.warn(
        "[AlreadyAuthenticatedOnLoginOrRegisterPage] Rejecting invalid nonce:",
        e.reasons,
      );
      redirectWithError(400, "bad_request");
    }
    throw e;
  }
  const { granted } = parseAndGrantScopes(opts.scope ?? undefined);
  if (granted.length === 0) {
    console.warn(
      "[AlreadyAuthenticatedOnLoginOrRegisterPage] Flow missing a supported scope",
    );
    redirectWithError(400, "bad_request");
  }
  const grant_context = {
    nonce: url_nonce,
    scope: granted.join(" "),
  };

  if (!isAppAuthorized) {
    // App NOT authorized — show consent screen
    return (
      <AppAuthorizationConsentScreen
        app_id={app.app_id}
        app_name={app.app_name}
        app_description={app.app_description}
        onSuccessfulAuthenticate={on_successful_authenticate}
        mode="authorize-and-redirect"
        debug={opts.debug}
      />
    );
  }

  const authorization_code: string = await generateAuthorizationCode(
    dbh.db,
    uid,
    app_id,
    code_challenge,
    code_challenge_method,
    challenge_time,
    redirect_uri,
    opts.debug,
    grant_context,
  );
  if (typeof authorization_code !== 'string') {
    console.error("Expected generated authorization code to be a string!");
    redirectWithError(500, "internal_server_error");
  }

  // Defense-in-depth: re-validate at the echo boundary so a malformed
  // value cannot slip through even if an upstream caller forgets to
  // validate before handing us `opts.state`.
  let echoedState: string | null;
  try {
    echoedState = parseOAuth2State(opts.state);
  } catch (e: unknown) {
    if (e instanceof OAuth2StateValidationError) {
      console.warn(
        "[AlreadyAuthenticatedOnLoginOrRegisterPage] Rejecting invalid OAuth2 state:",
        e.reasons,
      );
      redirectWithError(400, "bad_request");
    }
    throw e;
  }

  if (on_successful_authenticate === "redirect-with-authorization-code") {
    if (!redirect_uri) {
      redirectWithError(400, "bad_request");
    }
    // One callback, both parameter shapes: the spec params (`code` +
    // `iss`, RFC 9207) for standard OIDC relying parties AND the legacy
    // SDK params (`authorization_code` + `challenge_time` +
    // `code_challenge_method`) for deployed SchemaVaults SDK clients.
    // `state` is echoed once for both.
    const queryParams = new URLSearchParams();
    queryParams.set('code', authorization_code);
    queryParams.set('iss', getAuthServerUri());
    queryParams.set('authorization_code', authorization_code);
    queryParams.set('challenge_time', challenge_time.toString());
    queryParams.set('code_challenge_method', 'S256');
    if (echoedState) {
      queryParams.set('state', echoedState);
    }
    return redirect(`${redirect_uri}?${queryParams.toString()}`);
  } else if (on_successful_authenticate === "send-authorization-code-to-native-app-then-close") {
    if (!redirect_uri) {
      redirectWithError(400, "bad_request");
    }
    return (
      <NativeAppCodeDelivery
        authorization_code={authorization_code}
        redirect_uri={redirect_uri}
        code_challenge_method="S256"
        challenge_time={challenge_time}
        state={echoedState}
      />
    );
  } else {
    console.error("Unhandled 'on_successful_authenticate' for AlreadyAuthenticatedOnLoginOrRegisterPage!");
    redirectWithError(500, "internal_server_error");
  }
}
