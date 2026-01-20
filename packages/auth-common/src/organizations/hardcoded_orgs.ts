import { OrganizationDefinition } from "./organization_definition";
import SCHEMAVAULTS_ORGANIZATION_ID from "./schemavaults_org_id";

const DefaultHardcodedOrgCreationTime = new Date("2024-01-01T00:00:00Z");

export const hardcodedOrgs: readonly OrganizationDefinition[] = [
  {
    name: "SchemaVaults",
    organization_id: SCHEMAVAULTS_ORGANIZATION_ID,
    created_at: DefaultHardcodedOrgCreationTime.getTime(),
  },
];

export default hardcodedOrgs;
