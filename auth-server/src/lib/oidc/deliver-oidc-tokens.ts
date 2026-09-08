import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { OidcRefreshTokenDeliveryMode } from "@schemavaults/auth-common";
import getHostname from "@/lib/hostname";
import setRefreshTokenCookieOnResponse from "@/lib/setRefreshTokenCookieOnResponse";
import type { IssuedOidcTokens, OidcTokenResponseBody } from "./issue-oidc-tokens";
import { resolveRefreshTokenDeliveryMode } from "./token-request-extensions";

/**
 * RFC 6749 §5.1 success response: JSON body with no-store caching (§5.1
 * requires the authorization server to prevent caching of token
 * responses). CORS headers are applied by the route once it knows the
 * client's allowance.
 */
export function oidcTokenSuccessResponse(
  body: OidcTokenResponseBody,
): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

export interface DeliverOidcTokensOptions {
  request: NextRequest;
  issued: IssuedOidcTokens;
  client_app_id: AppId;
  /** The client's requested `refresh_token_delivery` mode. */
  requested_delivery: OidcRefreshTokenDeliveryMode;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

/**
 * Builds the token response, delivering the refresh token either inline
 * (RFC 6749 §5.1) or — when the resolved delivery mode is
 * `http_only_cookie` — as the platform's HTTP-only refresh-token cookie
 * plus its JS-readable expiry marker cookie, with `refresh_token` omitted
 * from the JSON body. `refresh_token_expires_in` is present either way.
 */
export async function deliverOidcTokens({
  request,
  issued,
  client_app_id,
  requested_delivery,
  environment,
  debug = false,
}: DeliverOidcTokensOptions): Promise<NextResponse> {
  const secure: boolean =
    environment !== "development" && environment !== "test";
  const mode: OidcRefreshTokenDeliveryMode = resolveRefreshTokenDeliveryMode(
    client_app_id,
    requested_delivery,
    secure,
  );

  if (mode === "inline") {
    return oidcTokenSuccessResponse(issued.body);
  }

  const { refresh_token: _inlined, ...body_without_refresh_token } =
    issued.body;
  void _inlined;
  const response: NextResponse = oidcTokenSuccessResponse(
    body_without_refresh_token,
  );
  await setRefreshTokenCookieOnResponse({
    refresh_token: issued.refresh_token,
    client_app_id,
    req: request,
    res: response,
    secure,
    hostname: getHostname(request),
    debug,
  });
  return response;
}

export default deliverOidcTokens;
