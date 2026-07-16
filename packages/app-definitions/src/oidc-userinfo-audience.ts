import { type ApiServerId, apiServerIdSchema } from "./api-server-id";

/**
 * Reserved API-server / JWT-keyset audience id backing the parallel OIDC
 * surface. Access tokens issued to OIDC relying parties are minted (as the
 * platform's usual JWE format) for THIS audience, so they are opaque to the
 * RP and redeemable only at the auth server's own /api/oidc/userinfo
 * endpoint — never against the auth server's first-party API or any
 * registered resource server. id_tokens are signed with the same keyset's
 * RS256 signing key, whose public verification half is published at the
 * OIDC jwks_uri.
 *
 * The id is reserved by being a hardcoded API server definition (see
 * hardcoded-apis.ts), which blocks user registration/deletion of the id.
 */
export const OIDC_USERINFO_AUDIENCE_ID = "oidc-userinfo" as const;

export function getOidcUserinfoAudienceId(): ApiServerId {
  return apiServerIdSchema.parse(OIDC_USERINFO_AUDIENCE_ID);
}

export default getOidcUserinfoAudienceId;
