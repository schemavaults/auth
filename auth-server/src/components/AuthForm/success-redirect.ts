import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import {
  type CodeChallengeWithDetails,
  parseOAuth2StateOrNull,
} from "@schemavaults/auth-common";

export interface SuccessRedirectInputOptions {
  redirect_uri: string,
  authorization_code: string,
  code_challenge: CodeChallengeWithDetails,
  app_environment: SchemaVaultsAppEnvironment,
  // OAuth2 `state` (RFC 6749 §10.12) received from the client in the
  // authorize request. Must be echoed untouched on the callback so the
  // client can validate its stored CSRF nonce against this value.
  state?: string | null
}

export function successRedirect({
  redirect_uri, authorization_code, code_challenge, app_environment, state
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
  queryParams.set('challenge_time', code_challenge.challenge_time.toString());
  queryParams.set('code_challenge_method', code_challenge.code_challenge_method);
  queryParams.set('authorization_code', authorization_code);
  // Defense-in-depth: re-validate at this echo boundary so a malformed
  // `state` cannot be smuggled into the callback URL even if an
  // upstream caller skipped validation.
  const echoedState: string | null = parseOAuth2StateOrNull(state);
  if (echoedState) {
    queryParams.set('state', echoedState);
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
