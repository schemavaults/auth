import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { UserRegistry } from "@/lib/auth-db";
import generateAuthorizationCode from "@/lib/auth-db/users/generate-authorization-code";
import { doesRequestHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";
import { isEmailVerificationRequiredForClientApp } from "@/lib/email-verification/third-party-app-gate";
import { describeAppConsentStatus } from "@/lib/oauth2/api-scopes";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import captureServerException from "@/lib/captureServerException";
import { oidcAuthorizeErrorRedirect } from "./oidc-errors";
import type { ValidatedOidcAuthorizeRequest } from "./validate-authorize-request";

export interface AnswerSilentAuthorizeRequestOptions {
  request: NextRequest;
  dbh: ServerlessDatabase;
  validated: ValidatedOidcAuthorizeRequest;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

/**
 * Answers an authorization request with `prompt=none` (OIDC Core §3.1.2.1)
 * without showing any UI: when the user agent carries a valid auth server
 * session, the account may be handed to the app (e-mail verification gate),
 * and nothing needs the user's consent (the app is authorized and every
 * requested API scope it may be granted was consented to), it mints the
 * authorization code and redirects straight back to the client.
 * Otherwise it redirects back with `login_required`, `interaction_required`
 * or `consent_required`.
 */
export async function answerSilentAuthorizeRequest({
  request,
  dbh,
  validated,
  environment,
  debug = false,
}: AnswerSilentAuthorizeRequestOptions): Promise<NextResponse> {
  const { client_app_id, redirect_uri, state, nonce, code_challenge } = validated;
  const fail = (
    error: "login_required" | "interaction_required" | "consent_required" | "server_error",
    description: string,
  ): NextResponse => oidcAuthorizeErrorRedirect(redirect_uri, error, description, state);

  const session = await doesRequestHaveValidAuthServerRefreshToken(request);
  if (!session) {
    return fail("login_required", "The user is not signed in.");
  }

  try {
    const user = await new UserRegistry(dbh.db, debug).getUserByUID(session.uid);
    if (!user || user.disabled) {
      return fail("login_required", "The user is not signed in.");
    }
    if (
      await isEmailVerificationRequiredForClientApp({
        db: dbh.db,
        client_app_id,
        email_verified: user.email_verified === true,
      })
    ) {
      return fail(
        "interaction_required",
        "The user must verify their e-mail address before signing in to this application.",
      );
    }

    const status = await describeAppConsentStatus({
      dbh,
      uid: session.uid,
      client_app_id,
      scope: validated.scope.length > 0 ? validated.scope : null,
      resource: validated.resource,
      environment,
      debug,
    });
    if (status.consent_required) {
      return fail("consent_required", "The user has not consented to this request.");
    }

    const challenge_time: number = Date.now();
    const authorization_code: string = await generateAuthorizationCode(
      dbh.db,
      session.uid,
      client_app_id,
      code_challenge,
      "S256",
      challenge_time,
      redirect_uri,
      debug,
      { ...status.resolved.grant, nonce },
    );

    // The same callback shape as the interactive flow: the spec params
    // (`code`, `iss`, RFC 9207) plus the legacy SDK params.
    const location = new URL(redirect_uri);
    location.searchParams.set("code", authorization_code);
    location.searchParams.set("iss", getAuthServerUri());
    location.searchParams.set("authorization_code", authorization_code);
    location.searchParams.set("challenge_time", `${challenge_time}`);
    location.searchParams.set("code_challenge_method", "S256");
    if (state) {
      location.searchParams.set("state", state);
    }
    return NextResponse.redirect(location, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "answerSilentAuthorizeRequest",
      route: "/api/oidc/authorize",
      uid: session.uid,
      context: { client_app_id },
    });
    return fail("server_error", "Failed to answer the silent authorization request.");
  }
}

export default answerSilentAuthorizeRequest;
