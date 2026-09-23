import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaWebauthnCredentialList } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/webauthn";

export const listPasskeys = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List my passkeys",
  description:
    "Lists the caller's verified passkeys (WebAuthn credentials) with their label and usage timestamps. Pending enrollments are not listed. The payload is returned raw, without a `success` envelope.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The caller's passkeys", schema: MfaWebauthnCredentialList },
    ...sessionErrorResponses,
    500: { description: "Failed to load the passkeys", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    try {
      const mfaRegistry = new MfaRegistry(db);
      const rows = await mfaRegistry.listWebauthnCredentialsForUser(user.uid);

      const parsed = MfaWebauthnCredentialList.safeParse({
        // Only surface verified passkeys in the account UI; pending
        // (unverified) enrollments are not yet usable factors.
        credentials: rows
          .filter((row) => row.verified)
          .map((row) => ({
            factor_id: row.factor_id,
            label: row.label,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
          })),
      });
      if (!parsed.success) {
        await captureServerException(db, parsed.error, {
          op_name: "GET_webauthn_credentials_handler:response_schema_mismatch",
          route: ROUTE,
          uid: user.uid,
        });
        return ctx.json(500, { success: false, message: "Failed to load passkeys" });
      }
      return ctx.json(200, parsed.data);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_webauthn_credentials_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to load passkeys" });
    }
  },
});
