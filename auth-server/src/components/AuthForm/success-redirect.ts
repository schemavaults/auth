import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { CodeChallengeWithDetails } from "@schemavaults/auth-common";

export interface SuccessRedirectInputOptions {
  redirect_uri: string,
  authorization_code: string,
  code_challenge: CodeChallengeWithDetails,
  app_environment: SchemaVaultsAppEnvironment
}

export function successRedirect({
  redirect_uri, authorization_code, code_challenge, app_environment
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
