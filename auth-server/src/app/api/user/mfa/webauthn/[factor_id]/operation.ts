import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { mfaProofSchema } from "@schemavaults/auth-common";
import { evaluateMfaProof } from "@/app/api/auth/mfa/verify/evaluate-proof";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaFactorRemoved, mfaFactorIdParam } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { deleteStepUpChallenge, getStepUpChallenge } from "@/lib/mfa";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/user/mfa/webauthn/{factor_id}";

// Removing a passkey requires step-up proof of a current factor — proving the
// caller still controls the account, consistent with TOTP removal requiring a
// current code. The proof may be: a TOTP code (if the user has TOTP), a fresh
// passkey assertion (challenge from /webauthn/authenticate-options), or a
// recovery code.
const deleteBodySchema = z
  .object({
    proof: withOpenApi(mfaProofSchema, {
      description:
        "Step-up proof: a current TOTP code (`type: totp`), a passkey assertion for the challenge issued by `POST /api/user/mfa/webauthn/authenticate-options` (`type: webauthn`), or an unused recovery code (`type: recovery_code`).",
    }),
  })
  .strict()
  .openapi("MfaRemovePasskeyRequest");

export const removePasskey = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Remove a passkey",
  description:
    "Deletes one of the caller's passkeys. The request must carry a step-up proof of a current factor (any TOTP code, a fresh passkey assertion, or a recovery code); a passkey assertion consumes the step-up challenge whatever the outcome. Removing the last verified factor also discards the account's recovery codes. A security alert e-mail is sent.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: z.object({ factor_id: mfaFactorIdParam }),
    body: { lenientContentType: true, schema: deleteBodySchema },
  },
  responses: {
    200: { description: "The passkey was removed", schema: MfaFactorRemoved },
    ...validationErrorResponse,
    401: {
      description: "The step-up proof was not accepted (or no valid session was presented)",
      schema: ErrorResponse,
    },
    403: sessionErrorResponses[403],
    404: { description: "No such passkey for the caller", schema: ErrorResponse },
    500: { description: "Failed to remove the passkey", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis, environment } = ctx.context;
    const { factor_id } = ctx.params;
    const { proof } = ctx.body;

    const mfaRegistry = new MfaRegistry(db);

    try {
      const factor = await mfaRegistry.getFactorById({ uid: user.uid, factor_id });
      if (!factor || factor.factor_type !== "webauthn") {
        return ctx.json(404, { success: false, message: "Passkey not found" });
      }

      // For a webauthn step-up proof, consume the per-user assertion challenge
      // issued by /webauthn/authenticate-options (one-shot).
      let webauthnChallenge: string | null = null;
      if (proof.type === "webauthn") {
        webauthnChallenge = await getStepUpChallenge(redis.client, user.uid);
        await deleteStepUpChallenge(redis.client, user.uid);
      }

      const proofValid = await evaluateMfaProof({
        mfaRegistry,
        uid: user.uid,
        proof,
        webauthnChallenge,
      });
      if (!proofValid) {
        return ctx.json(401, { success: false, message: "Invalid verification" });
      }

      // If this is the user's last verified factor, wipe recovery codes too.
      const verifiedSummaries = await mfaRegistry.listVerifiedFactorsForUser(user.uid);
      const isLastVerifiedFactor =
        factor.verified &&
        verifiedSummaries.length === 1 &&
        verifiedSummaries[0]?.factor_id === factor_id;
      if (isLastVerifiedFactor) {
        await mfaRegistry.deleteAllFactorsForUser(user.uid);
      } else {
        await mfaRegistry.deleteFactor({ uid: user.uid, factor_id });
      }

      void sendMfaSecurityAlertEmail({
        to: user.email,
        action: "removed",
        db,
        redis,
        environment,
      });

      return ctx.json(200, { success: true });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_webauthn_factor_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to remove passkey" });
    }
  },
});
