import "server-only";
import type { ReactElement } from "react";

import LoginOrRegisterForm from "../LoginOrRegisterForm";
import determineOnSuccessfulAuthenticateAction from "../determineOnSuccessfulAuthenticateAction";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ServerRuntime } from "next/types";
import {
  OAuth2StateValidationError,
  OidcNonceValidationError,
  parseAndGrantScopes,
  parseOAuth2State,
  parseOidcNonce,
  type UserData,
} from "@schemavaults/auth-common";
import { doesSsrContextHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import redirectWithError from "@/lib/redirect-with-error";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import validateAppIdSearchParamOrRedirectWithError from "../validateAppIdSearchParamOrRedirectWithError";
import AlreadyAuthenticatedOnLoginOrRegisterPage from "../AlreadyAuthenticatedOnLoginOrRegisterPage";
import toPartialAppInfo from "@/lib/PartialAppInfo";
import { connection } from "next/server";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";
import resolveNextHref from "@/lib/next-href";

export default async function RegisterPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const searchParams = await props.searchParams;
  validateAppIdSearchParamOrRedirectWithError(searchParams.app_id);

  // Where to send the user after they authenticate (survives the
  // login ↔ register swap link, which forwards all search params).
  const next_href: string | null = resolveNextHref(searchParams.next_href);

  await using dbh = ServerlessDatabase.createDBH();

  const { action: on_successful_authenticate, app } =
    await determineOnSuccessfulAuthenticateAction({
      dbh,
      searchParams,
      debug,
    });

  if (on_successful_authenticate !== 'account-page') {
    const challenge_time_str = searchParams.challenge_time;
    if (typeof challenge_time_str === 'string') {
      const challenge_time = parseInt(challenge_time_str);
      if (!isNaN(challenge_time) && isPkceChallengeExpired(challenge_time)) {
        redirectWithError(400, "pkce_challenge_expired");
      }
    }
  }

  if (on_successful_authenticate !== 'account-page' && !app) {
    console.error("Failed to load app definition despite 'on_successful_authenticate' of: ", on_successful_authenticate);
    redirectWithError(500, "internal_server_error");
  }

  // OAuth2 redirect_uri allowlist check. For any third-party PKCE flow,
  // the `redirect_uri` arrived on the URL untrusted; refuse to render
  // the register form unless its origin is registered for this app in
  // the current environment. The /account flow has no redirect_uri so
  // this gate is skipped there.
  if (on_successful_authenticate !== 'account-page' && app) {
    const raw_redirect_uri = typeof searchParams.redirect_uri === 'string'
      ? searchParams.redirect_uri
      : null;
    if (!raw_redirect_uri) {
      console.warn("[RegisterPage] Third-party PKCE flow missing redirect_uri");
      redirectWithError(400, "invalid_redirect_uri");
    }
    const allowed = await isRedirectUriRegisteredForClientApp({
      redirect_uri: raw_redirect_uri,
      client_app_id: app.app_id,
      environment,
      dbh,
    });
    if (!allowed) {
      console.warn(
        `[RegisterPage] redirect_uri '${raw_redirect_uri}' is not registered for app '${app.app_id}'`,
      );
      redirectWithError(400, "invalid_redirect_uri");
    }

    // `scope` is a required entry parameter for third-party flows (the
    // register POST hard-requires it); `nonce` is optional on the URL
    // but validated when present. Mirrors login/page.tsx.
    const raw_scope = typeof searchParams.scope === 'string' ? searchParams.scope : null;
    if (!raw_scope || raw_scope.length > 256 || parseAndGrantScopes(raw_scope).granted.length === 0) {
      console.warn("[RegisterPage] Third-party flow missing or invalid 'scope'");
      redirectWithError(400, "bad_request");
    }
    try {
      parseOidcNonce(searchParams.nonce);
    } catch (e: unknown) {
      if (e instanceof OidcNonceValidationError) {
        console.warn("[RegisterPage] Rejecting invalid nonce:", e.reasons);
        redirectWithError(400, "bad_request");
      }
      throw e;
    }
  }

  // Validate OAuth2 `state` at the entry boundary. Malformed values
  // get a 400 so the client can't push garbage through the server's
  // logs or callback URL buffers via the echo path.
  let parsedState: string | null;
  try {
    parsedState = parseOAuth2State(searchParams.state);
  } catch (e: unknown) {
    if (e instanceof OAuth2StateValidationError) {
      console.warn("[RegisterPage] Rejecting invalid OAuth2 state:", e.reasons);
      redirectWithError(400, "bad_request");
    }
    throw e;
  }

  const alreadyAuthenticated: UserData | false = await doesSsrContextHaveValidAuthServerRefreshToken();
  if (alreadyAuthenticated) {
    return await AlreadyAuthenticatedOnLoginOrRegisterPage({
      dbh,
      app,
      on_successful_authenticate,
      next_href,
      uid: alreadyAuthenticated.uid,
      code_challenge: typeof searchParams.code_challenge === 'string' ? searchParams.code_challenge : null,
      code_challenge_method: typeof searchParams.code_challenge_method === 'string' ? searchParams.code_challenge_method : null,
      challenge_time_str: typeof searchParams.challenge_time === 'string' ? searchParams.challenge_time : null,
      redirect_uri: typeof searchParams.redirect_uri === 'string' ? searchParams.redirect_uri : null,
      state: parsedState,
      nonce: typeof searchParams.nonce === 'string' ? searchParams.nonce : null,
      scope: typeof searchParams.scope === 'string' ? searchParams.scope : null,
      debug
    });
  }

  let inviteCodeRequired: boolean
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    console.error("Failed to load server setting on whether invite codes are required: ", e);
    redirectWithError(500, "load_server_config_failure");
  }

  return (
    <LoginOrRegisterForm
      type={"register"}
      onSuccessfulAuthenticate={on_successful_authenticate}
      invite_code_required={inviteCodeRequired}
      debug={debug}
      app={app ? toPartialAppInfo(app) : null}
    />
  );
}

export const runtime: ServerRuntime = "nodejs";
