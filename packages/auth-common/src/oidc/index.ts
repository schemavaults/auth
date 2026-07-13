export {
  OIDC_OPENID_SCOPE,
  OIDC_SUPPORTED_SCOPES,
  DEFAULT_AUTH_SCOPE,
  parseAndGrantScopes,
  serializeOidcScopes,
} from "./scope";
export type { OidcSupportedScope, ParsedOidcScopes } from "./scope";

export {
  oidcNonceSchema,
  OIDC_NONCE_VSCHAR_REGEX,
  parseOidcNonce,
  OidcNonceValidationError,
  SYNTHESIZED_NONCE_PREFIX,
  isSynthesizedNonce,
} from "./nonce";
export type { OidcNonce } from "./nonce";
