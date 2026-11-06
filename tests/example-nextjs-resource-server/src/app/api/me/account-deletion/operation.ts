import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses } from "@/lib/api/schemas";

/**
 * An operation an agent must never perform for a user, whatever scope its
 * delegated token carries: `delegatedCallers: "refused"` lets only the
 * user's own credential through. This example records nothing.
 */
export const requestAccountDeletion = defineOperation({
  method: "post",
  path: "/api/me/account-deletion",
  summary: "Request deletion of my account",
  description:
    "Only the user's own credential may request it: a delegated token (an agent acting for the user, RFC 8693 `act`) is refused with 403 delegated_caller_refused, even when it carries the same scope. This example server records nothing.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes, delegatedCallers: "refused" }),
  responses: {
    202: {
      description: "The request was accepted (nothing is recorded in this example)",
      schema: z.object({ uid: z.string() }),
    },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(202, { uid: ctx.auth.user.uid }),
});
