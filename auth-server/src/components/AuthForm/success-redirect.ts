import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import {
  type CodeChallengeWithDetails,
  parseOAuth2State,
} from "@schemavaults/auth-common";

export interface SuccessRedirectInputOptions {
  redirect_uri: string,
  authorization_code: string,
  code_challenge: CodeChallengeWithDetails,
  app_environment: SchemaVaultsAppEnvironment,
  // OAuth2 `state` (RFC 6749 §10.12) received from the client in the
  // authorize request. Must be echoed untouched on the callback so the
  // client can validate its stored CSRF nonce against this value.
  state?: string | null,
  // OIDC mode (flow entered through GET /api/oidc/authorize): the
  // callback carries the spec parameter names — `code`, `state`, and
  // `iss` (RFC 9207) — instead of the custom-surface
  // `authorization_code`/`challenge_time`/`code_challenge_method`.
  oidc?: boolean,
  // Issuer for the RFC 9207 `iss` callback parameter; pass the auth
  // client's configured auth_server_url. Falls back to the current
  // origin when unavailable.
  issuer?: string | null,
}

export function successRedirect({
  redirect_uri, authorization_code, code_challenge, app_environment, state, oidc, issuer
}: SuccessRedirectInputOptions): void {
  if (app_environment !== 'production') {
    console.log('[successRedirect] Attempting redirect to: ', redirect_uri);
  }

  // Require HTTPS in production
  const requiresSSL: boolean = app_environment !== 'development' && app_environment !== 'test';
  if (requiresSSL && !redirect_uri.startsWith('https://')) {
    throw new Error('Redirect URI must use HTTPS in production');
  }

  const queryParams = new URLSearchParams();
  // Defense-in-depth: re-validate at this echo boundary. `parseOAuth2State`
  // throws `OAuth2StateValidationError` on a malformed value, which
  // aborts the redirect — the caller then surfaces a destructive toast.
  const echoedState: string | null = parseOAuth2State(state);
  if (oidc) {
    queryParams.set('code', authorization_code);
    if (echoedState) {
      queryParams.set('state', echoedState);
    }
    queryParams.set('iss', issuer || window.location.origin);
  } else {
    queryParams.set('challenge_time', code_challenge.challenge_time.toString());
    queryParams.set('code_challenge_method', code_challenge.code_challenge_method);
    queryParams.set('authorization_code', authorization_code);
    if (echoedState) {
      queryParams.set('state', echoedState);
    }
  }

  try {
    const final_redirect_url = `${redirect_uri}?${queryParams.toString()}` as const;

    if (app_environment !== 'production') {
      console.log('[successRedirect] Setting window.location.href = ', final_redirect_url);
    }

    window.location.href = final_redirect_url;
  } catch (e: unknown) {
    console.error("Failed to redirect to the redirect URI: ", e);
    throw new Error("Failed to redirect to the redirect URI!");
  }
}
