// JWKS access assertions are short-lived, single-use credentials: resource
// servers mint a fresh one immediately before each request to the auth
// server. Verification rejects assertions whose `iat` is older than this
// window (jose `maxTokenAge`), and the mint side uses the same value for
// `exp` so a token's self-declared lifetime matches the acceptance window.
export const JWKS_ACCESS_PROOF_TOKEN_MAX_AGE = "60s";

// Claims every JWKS access assertion must carry. Verification rejects
// tokens missing any of these (jose `requiredClaims`), so assertions minted
// without `jti`/`iat` cannot be accepted — and therefore cannot be replayed
// past the auth server's jti tracking.
export const JWKS_ACCESS_PROOF_TOKEN_REQUIRED_CLAIMS: readonly string[] = [
  "exp",
  "iat",
  "jti",
  "aud",
  "iss",
];
