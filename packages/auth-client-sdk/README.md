# @schemavaults/auth-client-sdk

TypeScript SDK for SchemaVaults Auth platform.

## Usage

See the downstream package [@schemavaults/auth-react-provider](https://github.com/schemavaults/auth-react-provider) for usage within a Next.js app.

See the SchemaVaults CLI for an example of usage within a command line application: [@schemavaults/cli](https://github.com/schemavaults/cli)

## How tokens are acquired

The SDK talks to the auth server's **standard OIDC surface** through the
[`openid-client`](https://github.com/panva/openid-client) package:

- Authorization codes and refresh tokens are redeemed at
  `POST /api/oidc/token` (RFC 6749 form-encoded requests). Redirect
  callbacks go through `openid-client`'s `authorizationCodeGrant()`, which
  verifies the OAuth2 `state`, the RFC 9207 `iss` parameter, PKCE, and the
  id_token `nonce`. Pass the callback's `iss` query parameter as the sixth
  argument of `handleSuccessfulAuthentication()` to enable the issuer check.
- Access tokens for API servers are requested with the RFC 8707 `resource`
  parameter — one access token per token request. The code grant carries the
  first configured default audience; remaining default audiences are
  acquired through follow-up refresh grants, and `acquireAccessToken()`
  fetches any other audience on demand.
- When the adapter reports `doesSupportHttpOnlyRefreshToken()`, the SDK asks
  the token endpoint for `refresh_token_delivery=http_only_cookie`: the
  refresh token is set as an HTTP-only cookie on the auth server's domain and
  never exposed to JavaScript; the SDK only tracks its expiry through the
  `refresh_token_expires_in` response field. Otherwise the refresh token is
  inlined and stored through the adapter.
- The platform's full `UserData` (`currentUser`) is synced from
  `GET /api/auth/whoami/[client_app_id]` after every login and refresh.

The server metadata is the auth server's own discovery document, built
locally with `buildOidcProviderMetadata()` from `@schemavaults/auth-common`
(the same function the server serves at `/.well-known/openid-configuration`),
so no discovery request is made and the SDK cannot drift from what the
server advertises. Plain-HTTP auth servers (local development) are supported.

## Dependencies

- [@schemavaults/auth](https://github.com/schemavaults/auth)
- [@schemavaults/app-definitions](https://github.com/schemavaults/app-definitions)
- [openid-client](https://github.com/panva/openid-client)
