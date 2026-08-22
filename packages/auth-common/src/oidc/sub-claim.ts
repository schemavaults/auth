import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

// The OIDC-facing `sub` claim namespaces the platform user id with the
// deployment's own app id (SCHEMAVAULTS_AUTH_SERVER_APP_ID), Auth0-style:
// `<auth_server_app_id>|<uid>` (e.g. "schemavaults-auth|4f7c…"). The
// prefix marks which auth deployment a subject came from, so RPs that
// aggregate identities from several issuers / white-label deployments
// can't collide or confuse them. It applies ONLY at the OIDC boundary —
// the id_token, /api/oidc/userinfo, and RFC 7662 introspection, which
// OIDC Core §5.3.2 requires to agree exactly — never inside the
// platform's own encrypted access/refresh token payloads, whose
// `sub === uid` invariant (payload_data.ts) resource servers rely on.
// The app id charset ([a-z0-9_-]) can never contain the delimiter, so
// the encoding is unambiguous.

export const OIDC_SUB_CLAIM_DELIMITER = "|" as const;

/**
 * Builds the OIDC-facing `sub` claim for a platform user:
 * `<auth_server_app_id>|<uid>`. The auth server app id is stable per
 * deployment, so the resulting subject is stable for the lifetime of
 * the user (OIDC Core §2: `sub` must be locally unique and never
 * reassigned within the issuer).
 */
export function formatOidcSubClaim(
  auth_server_app_id: AppId | string,
  uid: string,
): string {
  const app_id = appIdSchema.safeParse(auth_server_app_id);
  if (!app_id.success) {
    throw new TypeError(
      "Invalid auth server app id for OIDC 'sub' claim prefix!",
      { cause: app_id.error },
    );
  }
  if (typeof uid !== "string" || uid.length === 0) {
    throw new TypeError("A user id is required to build an OIDC 'sub' claim!");
  }
  return `${app_id.data}${OIDC_SUB_CLAIM_DELIMITER}${uid}`;
}

/**
 * Splits an OIDC-facing `sub` claim back into the issuing deployment's
 * app id and the platform user id. Returns `null` for values not in the
 * `<app_id>|<uid>` shape (e.g. subjects issued by other providers).
 * Only the FIRST delimiter splits — the uid keeps any later characters
 * verbatim.
 */
export function parseOidcSubClaim(
  sub: string,
): { auth_server_app_id: AppId; uid: string } | null {
  if (typeof sub !== "string") {
    return null;
  }
  const delimiter_index = sub.indexOf(OIDC_SUB_CLAIM_DELIMITER);
  if (delimiter_index <= 0) {
    return null;
  }
  const app_id = appIdSchema.safeParse(sub.slice(0, delimiter_index));
  if (!app_id.success) {
    return null;
  }
  const uid = sub.slice(delimiter_index + OIDC_SUB_CLAIM_DELIMITER.length);
  if (uid.length === 0) {
    return null;
  }
  return { auth_server_app_id: app_id.data, uid };
}
