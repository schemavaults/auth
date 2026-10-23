import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses } from "@/lib/api/schemas";

/**
 * An API scope this resource server defines on the auth server (the E2E
 * suite defines it on the example API server): clients get it by asking
 * for it with this API server as the RFC 8707 `resource` of their
 * authorization request.
 */
export const EXAMPLE_NOTES_READ_SCOPE = "example:notes.read" as const;

export const myNotes = defineOperation({
  method: "get",
  path: "/api/me/notes",
  summary: "My notes",
  description: `Only access tokens granted the \`${EXAMPLE_NOTES_READ_SCOPE}\` API scope may read the caller's notes; any other token is refused with 403 insufficient_scope.`,
  tags: ["Account"],
  auth: requireAuth({
    schemes: userCredentialSchemes,
    requiredScopes: [EXAMPLE_NOTES_READ_SCOPE],
  }),
  responses: {
    200: {
      description: "The caller's notes (always empty in this example)",
      schema: z.object({ uid: z.string(), notes: z.array(z.string()) }),
    },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid, notes: [] }),
});
