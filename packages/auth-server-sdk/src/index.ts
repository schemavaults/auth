export * from "./middleware";
export type * from "./middleware";

export * from "./route_guards";
export type * from "./route_guards";

export * from "./JwtKeyManager";
export type * from "./JwtKeyManager";

export * from "./DatabaseResourceGroup";
export type * from "./DatabaseResourceGroup";

export { redirectWithError } from "./redirect-with-error";
export type * from "./redirect-with-error";

export {
  ERROR_MESSAGE_CATALOG,
  isValidErrorId,
} from "./auth-server-error-message-catalog";
export type { SchemaVaultsAuthErrorId } from "./auth-server-error-message-catalog";

import MaximumBrowserCookieSize from "./MaximumBrowserCookieSize";
export { MaximumBrowserCookieSize };

export { getSchemavaultsApiServerId } from "./get-schemavaults-api-server-id";
export type { ApiServerId } from "@schemavaults/app-definitions";

export {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "./RefreshTokenCookieNames";

export { default as getStringByteSize } from "./getStringByteSize";
