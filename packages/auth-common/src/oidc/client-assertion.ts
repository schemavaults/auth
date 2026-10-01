// JWT client assertions (RFC 7521 §4.2, RFC 7523 §2.2 / §3): a client
// authenticates by sending `client_assertion_type` with this value plus a
// JWT signed with its private key as `client_assertion`. API servers do this
// at the introspection endpoint with their JWKS access key: the
// `createJwksAccessProofToken()` assertion (@schemavaults/jwt) already
// carries `iss` = `sub` = the API server id, `aud` = the issuer, a short
// `exp` and a single-use `jti`, which is the `private_key_jwt` method.

export const OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" as const;
