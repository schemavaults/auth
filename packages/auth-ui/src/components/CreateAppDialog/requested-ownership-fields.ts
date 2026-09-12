import type {
  RequestedResourceOwnership,
  ResourceOwnershipFields,
} from "@schemavaults/app-definitions";

/**
 * @description Maps the ownership a create form was opened with onto the
 * ownership fields of a creation request body (`POST /api/apps`,
 * `POST /api/apis`). The server re-validates that the caller may create
 * resources for that owner; see `resolveRequestedOwnershipForCreation`.
 */
export function requestedOwnershipToDefinitionFields(
  ownership: RequestedResourceOwnership,
): Required<Pick<ResourceOwnershipFields, "owner_type" | "owner_organization_id" | "owner_uid">> {
  switch (ownership.owner_type) {
    case "platform":
      return { owner_type: "platform", owner_organization_id: null, owner_uid: null };
    case "organization":
      return {
        owner_type: "organization",
        owner_organization_id: ownership.owner_organization_id,
        owner_uid: null,
      };
    case "user":
      return {
        owner_type: "user",
        owner_organization_id: null,
        owner_uid: ownership.owner_uid,
      };
  }
}

export default requestedOwnershipToDefinitionFields;
