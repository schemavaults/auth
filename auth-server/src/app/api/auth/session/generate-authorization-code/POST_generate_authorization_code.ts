import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  generateAuthorizationCode,
  type AuthorizationCodeGrantContext,
} from "@/lib/auth-db/users/generate-authorization-code";
import { z } from "zod";
import { appIdSchema } from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { codeChallengeSchema } from "@schemavaults/auth-common/pkce/code_challenge.js";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import {
  oidcNonceSchema,
  oidcScopeSchema,
  parseAndGrantScopes,
} from "@schemavaults/auth-common";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";

const requestBodySchema = z
  .object({
    client_app_id: appIdSchema,
    code_challenge: codeChallengeSchema,
    code_challenge_method: z.literal("S256"),
    challenge_time: z.number().nonnegative(),
    // OAuth2 `redirect_uri` to bind to the issued authorization code.
    // Required when minting for a third-party app; absent only when the
    // auth server itself is the requesting app (the /account flow has
    // no third-party callback to bind).
    redirect_uri: z.string().url().nullable().optional(),
    // Login replay nonce (OPTIONAL, OIDC Core §3.1.2.1) + requested
    // scopes (REQUIRED, RFC 6749 §3.3 wire format); see handle_login.ts.
    nonce: oidcNonceSchema.nullable().optional(),
    scope: oidcScopeSchema,
  })
  .required({
    client_app_id: true,
    code_challenge: true,
    code_challenge_method: true,
    challenge_time: true,
    scope: true,
  })
  .strict()
  .refine(
    (body) => parseAndGrantScopes(body.scope).granted.length > 0,
    "scope must include at least one supported scope (openid, email, profile)",
  );

export async function POST_generate_authorization_code(
  request: NextRequest,
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log(
          "[/api/auth/session/generate-authorization-code] POST request received",
        );
      }

      let body: z.infer<typeof requestBodySchema>;
      try {
        const raw = await request.json();
        const parsed = requestBodySchema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, message: "Invalid request body" },
            { status: 400 },
          );
        }
        body = parsed.data;
      } catch {
        return NextResponse.json(
          { success: false, message: "Failed to parse request body" },
          { status: 400 },
        );
      }

      if (isPkceChallengeExpired(body.challenge_time)) {
        return NextResponse.json(
          { success: false, message: "PKCE challenge has expired", error_id: "pkce_challenge_expired" },
          { status: 400 },
        );
      }

      // OAuth2 redirect_uri allowlist check. Refuse to mint a code if a
      // redirect_uri was supplied that is not registered for the
      // requesting client app. The auth server's own /account flow
      // legitimately has no redirect_uri to bind, so null is accepted
      // only for the hardcoded auth-server app_id.
      const presentedRedirectUri: string | null = body.redirect_uri ?? null;
      if (presentedRedirectUri !== null) {
        const allowed = await isRedirectUriRegisteredForClientApp({
          redirect_uri: presentedRedirectUri,
          client_app_id: body.client_app_id,
          environment,
          dbh,
        });
        if (!allowed) {
          return NextResponse.json(
            {
              success: false,
              message: "redirect_uri is not registered for this client_app_id",
              error_id: "invalid_redirect_uri",
            },
            { status: 400 },
          );
        }
      } else if (body.client_app_id !== getAuthServerAppId()) {
        return NextResponse.json(
          {
            success: false,
            message: "redirect_uri is required for this client_app_id",
            error_id: "invalid_redirect_uri",
          },
          { status: 400 },
        );
      }

      // Granted scopes are re-derived server-side (never trusted
      // verbatim); the schema refinement guaranteed at least one.
      const grant_context: AuthorizationCodeGrantContext = {
        nonce: body.nonce ?? null,
        scope: parseAndGrantScopes(body.scope).granted.join(" "),
      };

      try {
        const authorization_code = await generateAuthorizationCode(
          dbh.db,
          user.uid,
          body.client_app_id,
          body.code_challenge,
          body.code_challenge_method,
          body.challenge_time,
          presentedRedirectUri,
          environment === "development",
          grant_context,
        );

        return NextResponse.json({
          success: true,
          authorization_code,
        });
      } catch (e: unknown) {
        console.error(
          "[generate-authorization-code] Failed to generate authorization code:",
          e,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Failed to generate authorization code",
          },
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(request);
}

export default POST_generate_authorization_code;
