import {
  getAuthServerOwnerOrganizationId,
  getAuthServerOwnerOrganizationName,
} from "@schemavaults/app-definitions";
import { OrganizationDefinition } from "./organization_definition";

const DefaultHardcodedOrgCreationTime = new Date("2024-01-01T00:00:00Z");

/**
 * @description Builds the virtual "hardcoded" organizations fresh on each call
 * so the owner organization's ID and display name are resolved from the
 * SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION / _NAME environment variables at
 * call time rather than module load. Server-side only — client code should
 * receive the value via context/props (see useAuthUiOwnerOrganizationId).
 */
export function getHardcodedOrgs(): readonly OrganizationDefinition[] {
  return [
    {
      name: getAuthServerOwnerOrganizationName(),
      organization_id: getAuthServerOwnerOrganizationId(),
      created_at: DefaultHardcodedOrgCreationTime.getTime(),
    },
  ];
}

export default getHardcodedOrgs;
