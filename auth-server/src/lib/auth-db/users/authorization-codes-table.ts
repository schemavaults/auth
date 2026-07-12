import type { Insertable, Selectable } from "@schemavaults/dbh";
import { appIdSchema } from "@schemavaults/app-definitions";
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
    // OIDC replay nonce (OIDC Core §3.1.2.1) bound at issuance; echoed as
    // an id_token claim at redemption. Null for non-OIDC flows and OIDC
    // requests that omitted it. Printable-ASCII bound mirrors
    // oidcNonceSchema in @schemavaults/auth-common.
    nonce: z.string().min(1).max(512).nullable().optional(),
    // Granted OIDC scopes (space-delimited, RFC 6749 §3.3), e.g.
    // "openid email". Null for non-OIDC flows.
    scope: z.string().max(256).nullable().optional(),
    // Which surface minted the code: OIDC codes are redeemable only at
    // /api/oidc/token, custom-surface codes only at the legacy token
    // routes. Defaults false in the DB (migration 00029).
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
