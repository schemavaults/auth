import "server-only";

/**
 * Client authentication at the introspection endpoint (RFC 7662 §2.1):
 *
 *   - parse-introspection-request.ts: the `token` and exactly one
 *     credential method, from the form and `Authorization` header — pure
 *   - authenticate-introspection-caller.ts: verify those credentials,
 *     dispatching to
 *       - authenticate-client-app.ts: client secret (confidential apps)
 *       - authenticate-api-server.ts: `private_key_jwt` with the API
 *         server's JWKS access key (get-unverified-assertion-issuer.ts
 *         names the server to verify against)
 */

export { parseIntrospectionRequest } from "./parse-introspection-request";

export { authenticateIntrospectionCaller } from "./authenticate-introspection-caller";

export { authenticateClientApp } from "./authenticate-client-app";
export type { AuthenticateClientAppOptions } from "./authenticate-client-app";

export { authenticateApiServer } from "./authenticate-api-server";
export type { AuthenticateApiServerOptions } from "./authenticate-api-server";

export { getUnverifiedAssertionIssuer } from "./get-unverified-assertion-issuer";

export {
  invalidIntrospectionClient,
  invalidIntrospectionRequest,
} from "./types";
export type {
  AuthenticateIntrospectionCallerResult,
  IntrospectionClientCredentials,
  IntrospectionRequestError,
  ParsedIntrospectionRequest,
  ParseIntrospectionRequestResult,
} from "./types";
