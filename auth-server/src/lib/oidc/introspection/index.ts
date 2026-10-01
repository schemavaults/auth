import "server-only";

/**
 * RFC 7662 token introspection (`POST /api/oidc/introspect`), behind the
 * endpoint's client authentication:
 *
 *   - introspect-oidc-token.ts: the entry point, chaining the steps below
 *   - caller-visibility.ts: which tokens each caller (client app / API
 *     server) may see — pure rules
 *   - decode-introspectable-token.ts: verify the token with the keyset the
 *     caller's rules name
 *   - is-introspected-token-active.ts: revocation, consent and app-to-API
 *     connection checks
 *   - build-active-introspection-response.ts: the §2.2 metadata — pure
 */

export { introspectOidcToken } from "./introspect-oidc-token";
export type { IntrospectOidcTokenOptions } from "./introspect-oidc-token";

export {
  isTokenIssuedToCaller,
  resolveIntrospectionDecodePlan,
} from "./caller-visibility";
export type {
  IntrospectionDecodePlan,
  ResolveIntrospectionDecodePlanOptions,
} from "./caller-visibility";

export { decodeIntrospectableToken } from "./decode-introspectable-token";
export type { DecodeIntrospectableTokenOptions } from "./decode-introspectable-token";

export { isIntrospectedTokenActive } from "./is-introspected-token-active";
export type { IsIntrospectedTokenActiveOptions } from "./is-introspected-token-active";

export { buildActiveIntrospectionResponse } from "./build-active-introspection-response";
export type { BuildActiveIntrospectionResponseOptions } from "./build-active-introspection-response";

export { INACTIVE_INTROSPECTION_RESPONSE } from "./types";
export type {
  ActiveOidcIntrospectionResponseBody,
  DecodedIntrospectableToken,
  IntrospectableTokenKind,
  OidcIntrospectionCaller,
  OidcIntrospectionResponseBody,
} from "./types";
