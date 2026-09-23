import "server-only";
import { deleteCookie } from "cookies-next/server";
import { type NextRequest, NextResponse } from "next/server";
import getHostname from "@/lib/hostname";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  type AppId,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import {
  ServerlessDatabase,
  SchemaVaultsAppRegistry,
  revokeToken,
  revokeTokensIssuedWithRefreshToken,
} from "@/lib/auth-db";
import { refreshTokenExpiry } from "@schemavaults/auth-common";
import { getKeysetIdFromToken, decodeJWT } from "@schemavaults/jwt";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import {
  getOriginFromRequest,
  getAppAllowedOriginsForEnvironment,
  isOriginAllowedForClientApp,
  buildCorsHeaders,
} from "@/lib/cors/cors-for-client-app";
import captureServerException from "@/lib/captureServerException";

/**
 * POST /api/auth/logout/{client_app_id}: revokes the presented refresh
 * token (and the access tokens minted with it) when it verifies, then
 * clears the client app's refresh token cookies. Behaviour predates the
 * operations runtime and is kept as-is (the runtime validates the id).
 */
export async function handleLogout(req: NextRequest, client_app_id: AppId): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  if (debug) {
    console.log(`${req.method} => /api/auth/logout/${client_app_id}`);
  }

  const origin = getOriginFromRequest(req);

  await using dbh = ServerlessDatabase.createDBH();

  // Check if app exists
  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const app = await appRegistry.getApp(client_app_id);
  if (!app) {
    return NextResponse.json(
      { message: "App not found", success: false, error: true },
      { status: 404 },
    );
  }

  // Web apps must have Origin header
  if (app.web && !origin) {
    return NextResponse.json(
      { message: "Web apps must include Origin header", success: false, error: true },
      { status: 403 },
    );
  }

  // Validate CORS if origin is present
  let corsHeaders: HeadersInit | undefined;
  if (origin) {
    const allowedOrigins = await getAppAllowedOriginsForEnvironment(client_app_id, environment, dbh);

    if (!isOriginAllowedForClientApp(origin, allowedOrigins)) {
      return NextResponse.json(
        {
          message: `Origin '${origin}' is not allowed for app '${client_app_id}'`,
          success: false,
          error: true,
        },
        { status: 403 },
      );
    }

    corsHeaders = buildCorsHeaders(origin);
  }

  const logout_success_response = NextResponse.json(
    { message: "Cleared refresh token successfully", success: true, error: false },
    { status: 200, headers: corsHeaders },
  );

  const refresh_token_cookie_name: string = RefreshTokenCookieName(client_app_id);
  const refresh_token_expiry_cookie_name: string = RefreshTokenExpiryCookieName(client_app_id);

  // Revoke THIS session server-side before clearing cookies:
  //  1. the presented refresh token's jti, so it can never be redeemed (or
  //     presented to a route guard) again;
  //  2. the access token(s) minted alongside it (issued_tokens.refresh_jti),
  //     which have their own jti and would otherwise outlive the logout.
  // Deliberately NOT the user's tokens_valid_after watermark: that is the
  // password-reset remedy and would end the user's sessions in every other
  // client app and on every other device, and kill any authorization code
  // a relying party is about to redeem.
  try {
    const refresh_token_value = req.cookies.get(refresh_token_cookie_name)?.value;
    if (refresh_token_value) {
      const keyset_id = getKeysetIdFromToken(refresh_token_value);
      const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db);
      const keyset = await jwt_keys_manager.getKeyset(getAuthServerAppId(), keyset_id);
      const decoded = await decodeJWT({
        type: "refresh",
        jwt: refresh_token_value,
        jwt_keys: keyset,
        env: environment,
      });
      if (decoded.jti) {
        const expires_at = Date.now() + refreshTokenExpiry * 1000;
        await revokeToken(dbh.db, decoded.jti, decoded.uid, expires_at);
        const siblings_revoked: number = await revokeTokensIssuedWithRefreshToken(
          dbh.db,
          decoded.jti,
          decoded.uid,
        );
        if (debug) {
          console.log(
            `[/api/auth/logout/${client_app_id}] Revoked refresh token jti '${decoded.jti}' and ${siblings_revoked} access token(s) issued with it for user '${decoded.uid}'`,
          );
        }
      }
    }
  } catch (e: unknown) {
    // Token may be expired, invalid, or missing -- still proceed with cookie clearing
    if (debug) {
      console.warn("[logout] Could not revoke session server-side (token may be expired/invalid): ", e);
    }
  }

  try {
    const domain: string = getHostname(req);
    if (debug) {
      console.log(
        `[/api/auth/logout/${client_app_id}] Deleting cookie with ID '${refresh_token_cookie_name}' from domain '${domain}'`,
      );
    }
    await deleteCookie(refresh_token_cookie_name satisfies string, {
      httpOnly: true,
      req,
      res: logout_success_response,
      domain,
    });
    if (debug) {
      console.log(
        `[/api/auth/logout/${client_app_id}] Deleting cookie with ID '${refresh_token_expiry_cookie_name}' from domain '${domain}'`,
      );
    }
    await deleteCookie(refresh_token_expiry_cookie_name satisfies string, {
      httpOnly: false,
      req,
      res: logout_success_response,
      domain,
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "logout.deleteRefreshTokenCookies",
      route: "/api/auth/logout/[client_app_id]",
      context: { client_app_id },
    });
    return NextResponse.json(
      { message: "Failed to delete your refresh token cookies!", success: false, error: true },
      { headers: corsHeaders, status: 500 },
    );
  }

  return logout_success_response;
}

export default handleLogout;
