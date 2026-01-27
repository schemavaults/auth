export { AuthMiddleware } from "./auth-middleware";
export type {
  AuthMiddlewareOptions,
  AuthMiddlewareResult,
} from "./auth-middleware";

export * from "./auth-middleware-error";
export type * from "./auth-middleware-error";

export type { AuthMiddlewareRules } from "./middleware-rules";
export { defaultAuthMiddlewareRules } from "./default-auth-middleware-rules";

export { determineAuthStatus } from "./determine-auth-status";

export type { DecodeTokenFn } from "./decode-token-type";
export type { PotentiallyValidTokenSource } from "./token-source";
export { decodeJWTs, type IDecodeSeveralJwtsInputOptions } from "./decode-jwts";
