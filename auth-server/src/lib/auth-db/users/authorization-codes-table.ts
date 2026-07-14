import type { Insertable, Selectable } from "@schemavaults/dbh";
import { appIdSchema } from "@schemavaults/app-definitions";
import { oidcScopeSchema } from "@schemavaults/auth-common";
import { z } from "zod";

export const authorizationCodeRecordSchema = z
  .object({
    authorization_code: z.string(),
    uid: z.string().uuid(),
    client_app_id: appIdSchema,
    code_challenge: z.string().min(43),
    code_challenge_method: z.literal("S256"),
    challenge_time: z.number().nonnegative(),
    created_at: z.number().nonnegative(),
    expires_at: z.number().positive(),
    used_at: z.number().positive().nullable().optional(),
    // OAuth2 `redirect_uri` (RFC 6749 §4.1.3) bound at issuance. Null for
    // the auth server's own /account flow, which has no third-party
    // callback; the redemption must present the same null/string value
    // or it is rejected. Enforced as a valid URL so a malformed value
    // cannot reach the DB even if a server-side caller skips its own
    // body-schema check.
    redirect_uri: z.string().url().max(2048).nullable().optional(),
    // Login replay nonce (OIDC Core §3.1.2.1) bound at issuance; echoed
    // at redemption as the custom token-response `nonce` field / OIDC
    // id_token claim. OPTIONAL — an RP may omit it, so the column is
    // genuinely nullable (null → nothing echoed), which also lets
    // pre-upgrade rows (≤10 min TTL) parse. Printable-ASCII bound
    // mirrors oidcNonceSchema in auth-common.
    nonce: z.string().min(1).max(512).nullable().optional(),
    // Granted scopes (space-delimited, RFC 6749 §3.3), e.g.
    // "openid email". Validated with the shared oidcScopeSchema (the same
    // wire-format check applied when the scope was received). Every new
    // row has one; nullable for pre-upgrade rows only.
    scope: oidcScopeSchema.nullable().optional(),
    /**
     * @deprecated The surface-discriminator column was dropped in
     * migration 00030 (codes are redeemable at either token endpoint
     * now). The key is kept one release so `selectAll()` + `.strict()`
     * row parses succeed regardless of whether the migration has run
     * yet. Never written. Remove next release.
     */
    oidc: z.boolean().nullable().optional(),
  })
  .required({
    authorization_code: true,
    uid: true,
    client_app_id: true,
    code_challenge: true,
    code_challenge_method: true,
    challenge_time: true,
    created_at: true,
    expires_at: true,
  })
  .strict();

export type AuthorizationCodeRecord = z.infer<
  typeof authorizationCodeRecordSchema
>;

export type AuthorizationCodesTable = AuthorizationCodeRecord;

export type AuthorizationCode = Selectable<AuthorizationCodesTable>;
export type NewAuthorizationCode = Insertable<AuthorizationCodesTable>;
