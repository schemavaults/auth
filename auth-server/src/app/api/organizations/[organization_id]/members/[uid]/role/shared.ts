import { z } from "@schemavaults/openapi-operations";
import { organizationIdParams } from "@/lib/api/domain-schemas/organizations";

export const MEMBER_ROLE_ROUTE = "/api/organizations/{organization_id}/members/{uid}/role";

/** `{organization_id}` + `{uid}` path parameters of the member role operations. */
export const memberRoleParams = organizationIdParams.extend({
  uid: z.guid().openapi({ description: "User id of the member" }),
});
