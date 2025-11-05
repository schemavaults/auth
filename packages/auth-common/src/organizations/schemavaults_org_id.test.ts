import type { OrganizationID } from "./organization_id";

import { describe, test, expect } from "bun:test";
import { isValidOrganizationID } from "./organization_id";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "./schemavaults_org_id";
import { SCHEMAVAULTS_ORG_ID } from "@schemavaults/storage-regions";

describe("SchemaVaults Organization ID", () => {
  test("SchemaVaults organization ID is valid", () => {
    expect(
      isValidOrganizationID(
        SCHEMAVAULTS_ORGANIZATION_ID satisfies OrganizationID,
      ),
    ).toBeTruthy();
  });

  test("ID from @schemavaults/storage-regions package matches local declaration", () => {
    expect(SCHEMAVAULTS_ORGANIZATION_ID satisfies OrganizationID).toBe(
      SCHEMAVAULTS_ORG_ID satisfies OrganizationID,
    );
  });
});
