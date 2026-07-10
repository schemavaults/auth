import {
  type AppId,
  getAuthServerAppId,
} from "@schemavaults/app-definitions";

// SameSite=none | send cookie in all contexts
// SameSite=strict | send cookie in same-site contexts (navigations and other requests)
// SameSite=lax | send cookie in same-site requests and when navigating
export function determineRefreshTokenCookieSameSiteValue(
  client_app_id: AppId,
  secure: boolean,
): "none" | "lax" | "strict" {
  const isAuthServer: boolean = getAuthServerAppId() === client_app_id;
  if (isAuthServer) {
    return secure ? "strict" : "lax";
  } else {
    return "none";
  }
}

export default determineRefreshTokenCookieSameSiteValue;
