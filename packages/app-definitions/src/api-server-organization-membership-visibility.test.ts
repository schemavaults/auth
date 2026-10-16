import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY,
  getOrganizationMembershipAccess,
  getOrganizationMembershipVisibility,
  organizationMembershipVisibilitySchema,
} from "./api-server-organization-membership-visibility";
import { schemaVaultsApiServerDefinitionSchema } from "./api-server-definition";

describe("getOrganizationMembershipVisibility", () => {
  test("defaults to the owning organization only", () => {
    expect(DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY).toBe("owning_organization");
    expect(getOrganizationMembershipVisibility({})).toBe("owning_organization");
    expect(
      getOrganizationMembershipVisibility({
        organization_membership_visibility: "all_organizations",
      }),
    ).toBe("all_organizations");
  });

  test("the schema accepts only the two values", () => {
    expect(organizationMembershipVisibilitySchema.safeParse("owning_organization").success).toBe(true);
    expect(organizationMembershipVisibilitySchema.safeParse("all_organizations").success).toBe(true);
    expect(organizationMembershipVisibilitySchema.safeParse("any").success).toBe(false);
    expect(organizationMembershipVisibilitySchema.safeParse(true).success).toBe(false);
  });
});

describe("getOrganizationMembershipAccess", () => {
  test("the owning organization is always visible", () => {
    expect(getOrganizationMembershipAccess({ owner_organization_id: "acme" }, "acme")).toBe("owner");
    expect(
      getOrganizationMembershipAccess(
        { owner_organization_id: "acme", organization_membership_visibility: "all_organizations" },
        "acme",
      ),
    ).toBe("owner");
  });

  test("other organizations need the all_organizations grant", () => {
    expect(getOrganizationMembershipAccess({ owner_organization_id: "acme" }, "globex")).toBe(false);
    expect(
      getOrganizationMembershipAccess(
        { owner_organization_id: "acme", organization_membership_visibility: "owning_organization" },
        "globex",
      ),
    ).toBe(false);
    expect(
      getOrganizationMembershipAccess(
        { owner_organization_id: "acme", organization_membership_visibility: "all_organizations" },
        "globex",
      ),
    ).toBe("granted");
  });

  test("an API server without an owning organization only sees through the grant", () => {
    expect(getOrganizationMembershipAccess({ owner_organization_id: null }, "acme")).toBe(false);
    expect(
      getOrganizationMembershipAccess(
        { owner_organization_id: null, organization_membership_visibility: "all_organizations" },
        "acme",
      ),
    ).toBe("granted");
  });
});

describe("schemaVaultsApiServerDefinitionSchema", () => {
  const base = {
    api_server_id: "my-api",
    api_server_name: "My API",
    api_server_description: "",
    created_at: 0,
    public: false,
    hardcoded: false,
  };

  test("accepts definitions with and without the visibility field", () => {
    expect(schemaVaultsApiServerDefinitionSchema.safeParse(base).success).toBe(true);
    expect(
      schemaVaultsApiServerDefinitionSchema.safeParse({
        ...base,
        organization_membership_visibility: "all_organizations",
      }).success,
    ).toBe(true);
    expect(
      schemaVaultsApiServerDefinitionSchema.safeParse({
        ...base,
        organization_membership_visibility: "everyone",
      }).success,
    ).toBe(false);
  });
});
