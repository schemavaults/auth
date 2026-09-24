import { z } from "@schemavaults/openapi-operations";
import { organizationIdParams } from "@/lib/api/domain-schemas/organizations";

export { INVITATION_ROUTE, isOrganizationOwnerOrPlatformAdmin } from "../shared";

/** `{organization_id}` + `{invitation_id}` path parameters. */
export const invitationParams = organizationIdParams.extend({
  invitation_id: z.guid().openapi({ description: "Id of the invitation" }),
});
