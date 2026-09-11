---
name: oidc-subject-claim
description: Format and scope of the OIDC-facing `sub` claim (`<auth_server_app_id>|<uid>`, built by `formatOidcSubClaim`/`parseOidcSubClaim`), the three surfaces it applies to (id_token, userinfo, introspection), and why the platform's own encrypted access/refresh tokens keep `sub === uid`. Use when touching id_token, userinfo, or introspection claims, anything keyed on `sub`, or the auth server app id's effect on subjects.
---

# OIDC Subject Claim Format

The OIDC-facing `sub` claim is namespaced by the deployment's own app id, Auth0-style: `<auth_server_app_id>|<uid>` (e.g. `schemavaults-auth|4f7c…`), built/parsed by `formatOidcSubClaim`/`parseOidcSubClaim` in `@schemavaults/auth-common` (`src/oidc/sub-claim.ts`; the `|` delimiter can never appear in an app id). It applies on exactly three surfaces, which OIDC Core §5.3.2 requires to agree: the id_token (`generateIdToken` in `@schemavaults/jwt`, prefix from the optional `auth_server_app_id` option defaulting to `getAuthServerAppId()`), `GET/POST /api/oidc/userinfo`, and RFC 7662 introspection. The platform's own encrypted access/refresh token payloads are NOT OIDC and keep the `sub === uid` invariant (`payload_data.ts`) that resource-server SDKs and `UserData.sub` rely on. Because `SCHEMAVAULTS_AUTH_SERVER_APP_ID` is stable per deployment, subjects are stable per user; changing that env var (or the introduction of this prefix itself) changes every OIDC subject, so RPs keying storage on `sub` see new identities.
