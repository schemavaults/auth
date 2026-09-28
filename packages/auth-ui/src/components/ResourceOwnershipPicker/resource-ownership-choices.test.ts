/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import {
  computeResourceOwnershipChoices,
  defaultOrganizationForSelection,
  describeRequestedResourceOwnership,
  hasAvailableResourceOwnership,
  isResourceOwnershipSelectionAvailable,
  preferredResourceOwnershipForList,
  resolveDefaultResourceOwnershipSelection,
  resourceOwnershipSelectionToRequestedOwnership,
  type ComputeResourceOwnershipChoicesInput,
} from "./resource-ownership-choices";

const PLATFORM_ORG = "schemavaults";
const UID = "7f9c2ba4-e88f-4d2a-9c1f-0e6d8a3b5c71";

function membership(
  organization_id: string,
  role: OrganizationMembershipRoleDetails["role"],
  organization_name: string = `${organization_id} name`,
): OrganizationMembershipRoleDetails {
  return {
    organization_id,
    organization_name,
    role,
    created_at: 0,
    joined_at: 0,
  };
}

function input(
  overrides: Partial<ComputeResourceOwnershipChoicesInput> = {},
): ComputeResourceOwnershipChoicesInput {
  return {
    isGlobalAdmin: false,
    currentUserUid: UID,
    allowPersonal: true,
    memberships: [],
    membershipsLoading: false,
    membershipsError: false,
    platformOrganizationId: PLATFORM_ORG,
    ...overrides,
  };
}

describe("computeResourceOwnershipChoices", () => {
  test("a regular user without organizations: personal only, organization disabled, platform hidden", () => {
    const choices = computeResourceOwnershipChoices(input());
    expect(choices.user).toEqual({ status: "available" });
    expect(choices.organization).toEqual({
      status: "disabled",
      reason: "no-organizations",
    });
    expect(choices.platform).toEqual({ status: "hidden" });
    expect(choices.organizations).toEqual([]);
    expect(hasAvailableResourceOwnership(choices)).toBe(true);
  });

  test("only organizations the user owns or administers are offered", () => {
    const choices = computeResourceOwnershipChoices(
      input({
        memberships: [
          membership("org-owner", "owner"),
          membership("org-member", "member"),
          membership("org-admin", "admin"),
        ],
      }),
    );
    expect(choices.organization).toEqual({ status: "available" });
    expect(choices.organizations.map((o) => o.organization_id)).toEqual([
      "org-owner",
      "org-admin",
    ]);
    expect(choices.organizations[0]?.organization_name).toBe("org-owner name");
  });

  test("a plain member of organizations sees the organization option disabled", () => {
    const choices = computeResourceOwnershipChoices(
      input({ memberships: [membership("org-member", "member")] }),
    );
    expect(choices.organization).toEqual({
      status: "disabled",
      reason: "not-organization-admin",
    });
  });

  test("organization option is disabled while memberships load or after they fail", () => {
    expect(
      computeResourceOwnershipChoices(
        input({ memberships: undefined, membershipsLoading: true }),
      ).organization,
    ).toEqual({ status: "disabled", reason: "organizations-loading" });
    expect(
      computeResourceOwnershipChoices(
        input({ memberships: undefined, membershipsError: true }),
      ).organization,
    ).toEqual({ status: "disabled", reason: "organizations-error" });
  });

  test("global admins get the platform option, every membership, and never the platform's virtual organization", () => {
    const choices = computeResourceOwnershipChoices(
      input({
        isGlobalAdmin: true,
        memberships: [
          membership(PLATFORM_ORG, "admin"),
          membership("org-member", "member"),
        ],
      }),
    );
    expect(choices.platform).toEqual({ status: "available" });
    expect(choices.organizations.map((o) => o.organization_id)).toEqual([
      "org-member",
    ]);
  });

  test("the platform's virtual membership alone does not count as an organization", () => {
    const choices = computeResourceOwnershipChoices(
      input({
        isGlobalAdmin: true,
        memberships: [membership(PLATFORM_ORG, "admin")],
      }),
    );
    expect(choices.organization).toEqual({
      status: "disabled",
      reason: "no-organizations",
    });
  });

  test("personal ownership follows the server setting, except for global admins", () => {
    expect(
      computeResourceOwnershipChoices(input({ allowPersonal: false })).user,
    ).toEqual({ status: "disabled", reason: "personal-creation-disabled" });
    expect(
      computeResourceOwnershipChoices(
        input({ allowPersonal: false, isGlobalAdmin: true }),
      ).user,
    ).toEqual({ status: "available" });
    expect(
      computeResourceOwnershipChoices(input({ currentUserUid: null })).user,
    ).toEqual({ status: "disabled", reason: "account-loading" });
  });

  test("no owner is available to a user with personal ownership disabled and no organizations", () => {
    const choices = computeResourceOwnershipChoices(
      input({ allowPersonal: false }),
    );
    expect(hasAvailableResourceOwnership(choices)).toBe(false);
    expect(
      resolveDefaultResourceOwnershipSelection({ owner_type: "user" }, choices),
    ).toBeNull();
  });

  test("the context organization is offered first, even without a membership, and keeps the membership's name as fallback", () => {
    const choices = computeResourceOwnershipChoices(
      input({
        isGlobalAdmin: true,
        memberships: [membership("org-a", "owner", "Org A")],
        contextOrganization: {
          organization_id: "org-b",
          organization_name: "Org B",
        },
      }),
    );
    expect(choices.organizations).toEqual([
      { organization_id: "org-b", organization_name: "Org B" },
      { organization_id: "org-a", organization_name: "Org A" },
    ]);

    const unnamed = computeResourceOwnershipChoices(
      input({
        memberships: [membership("org-a", "owner", "Org A")],
        contextOrganization: { organization_id: "org-a", organization_name: null },
      }),
    );
    expect(unnamed.organizations).toEqual([
      { organization_id: "org-a", organization_name: "Org A" },
    ]);
  });
});

describe("resolveDefaultResourceOwnershipSelection", () => {
  const adminChoices = computeResourceOwnershipChoices(
    input({
      isGlobalAdmin: true,
      memberships: [
        membership("org-a", "owner"),
        membership("org-b", "admin"),
      ],
    }),
  );

  test("keeps the preferred owner when available", () => {
    expect(
      resolveDefaultResourceOwnershipSelection(
        { owner_type: "platform" },
        adminChoices,
      ),
    ).toEqual({ owner_type: "platform", owner_organization_id: null });
    expect(
      resolveDefaultResourceOwnershipSelection(
        { owner_type: "organization", owner_organization_id: "org-b" },
        adminChoices,
      ),
    ).toEqual({ owner_type: "organization", owner_organization_id: "org-b" });
  });

  test("leaves the organization unchosen when several are available and none is preferred", () => {
    expect(
      resolveDefaultResourceOwnershipSelection(
        { owner_type: "organization" },
        adminChoices,
      ),
    ).toEqual({ owner_type: "organization", owner_organization_id: null });
  });

  test("preselects the only organization", () => {
    const choices = computeResourceOwnershipChoices(
      input({ memberships: [membership("org-a", "owner")] }),
    );
    expect(
      resolveDefaultResourceOwnershipSelection(
        { owner_type: "organization" },
        choices,
      ),
    ).toEqual({ owner_type: "organization", owner_organization_id: "org-a" });
    expect(defaultOrganizationForSelection(choices, "unknown-org")).toBe(
      "org-a",
    );
  });

  test("falls back to the first available owner", () => {
    const choices = computeResourceOwnershipChoices(
      input({
        allowPersonal: false,
        memberships: [membership("org-a", "admin")],
      }),
    );
    expect(
      resolveDefaultResourceOwnershipSelection({ owner_type: "user" }, choices),
    ).toEqual({ owner_type: "organization", owner_organization_id: "org-a" });
    expect(
      resolveDefaultResourceOwnershipSelection(
        { owner_type: "platform" },
        computeResourceOwnershipChoices(input()),
      ),
    ).toEqual({ owner_type: "user", owner_organization_id: null });
  });
});

describe("isResourceOwnershipSelectionAvailable", () => {
  const choices = computeResourceOwnershipChoices(
    input({ memberships: [membership("org-a", "owner")] }),
  );

  test("rejects unavailable owners and organizations the user cannot use", () => {
    expect(
      isResourceOwnershipSelectionAvailable(
        { owner_type: "platform", owner_organization_id: null },
        choices,
      ),
    ).toBe(false);
    expect(
      isResourceOwnershipSelectionAvailable(
        { owner_type: "organization", owner_organization_id: "org-z" },
        choices,
      ),
    ).toBe(false);
  });

  test("accepts an organization selection that has not chosen an organization yet", () => {
    expect(
      isResourceOwnershipSelectionAvailable(
        { owner_type: "organization", owner_organization_id: null },
        choices,
      ),
    ).toBe(true);
  });
});

describe("resourceOwnershipSelectionToRequestedOwnership", () => {
  test("maps complete selections and refuses incomplete ones", () => {
    expect(
      resourceOwnershipSelectionToRequestedOwnership(
        { owner_type: "user", owner_organization_id: null },
        UID,
      ),
    ).toEqual({ owner_type: "user", owner_uid: UID });
    expect(
      resourceOwnershipSelectionToRequestedOwnership(
        { owner_type: "user", owner_organization_id: null },
        null,
      ),
    ).toBeNull();
    expect(
      resourceOwnershipSelectionToRequestedOwnership(
        { owner_type: "organization", owner_organization_id: "org-a" },
        UID,
      ),
    ).toEqual({ owner_type: "organization", owner_organization_id: "org-a" });
    expect(
      resourceOwnershipSelectionToRequestedOwnership(
        { owner_type: "organization", owner_organization_id: null },
        UID,
      ),
    ).toBeNull();
    expect(
      resourceOwnershipSelectionToRequestedOwnership(
        { owner_type: "platform", owner_organization_id: null },
        UID,
      ),
    ).toEqual({ owner_type: "platform" });
  });
});

describe("describeRequestedResourceOwnership", () => {
  test("names the owner", () => {
    const choices = computeResourceOwnershipChoices(
      input({ memberships: [membership("org-a", "owner", "Org A")] }),
    );
    expect(
      describeRequestedResourceOwnership(
        { owner_type: "user", owner_uid: UID },
        choices,
        "Acme",
      ),
    ).toBe("Owned by your account.");
    expect(
      describeRequestedResourceOwnership(
        { owner_type: "organization", owner_organization_id: "org-a" },
        choices,
        "Acme",
      ),
    ).toBe("Owned by Org A.");
    expect(
      describeRequestedResourceOwnership(
        { owner_type: "platform" },
        choices,
        "Acme",
      ),
    ).toBe("Owned by the Acme platform.");
  });
});

describe("preferredResourceOwnershipForList", () => {
  const base = { platformOrganizationId: PLATFORM_ORG };

  test("follows the list the create button sits on", () => {
    expect(preferredResourceOwnershipForList({ ...base, queryType: "all" })).toEqual({
      owner_type: "platform",
    });
    expect(
      preferredResourceOwnershipForList({
        ...base,
        queryType: "org",
        organization_id: "org-a",
      }),
    ).toEqual({ owner_type: "organization", owner_organization_id: "org-a" });
    expect(
      preferredResourceOwnershipForList({
        ...base,
        queryType: "org",
        organization_id: PLATFORM_ORG,
      }),
    ).toEqual({ owner_type: "platform" });
    expect(
      preferredResourceOwnershipForList({ ...base, queryType: "accessible" }),
    ).toEqual({ owner_type: "user" });
    expect(
      preferredResourceOwnershipForList({ ...base, queryType: "owned" }),
    ).toEqual({ owner_type: "user" });
    expect(
      preferredResourceOwnershipForList({ ...base, queryType: "authorized" }),
    ).toBeNull();
  });

  test("an owner-type filter picks the preselected owner of the viewer's lists", () => {
    expect(
      preferredResourceOwnershipForList({
        ...base,
        queryType: "accessible",
        ownerTypeFilter: "organization",
      }),
    ).toEqual({ owner_type: "organization" });
    expect(
      preferredResourceOwnershipForList({
        ...base,
        queryType: "all",
        ownerTypeFilter: "user",
      }),
    ).toEqual({ owner_type: "user" });
    expect(
      preferredResourceOwnershipForList({
        ...base,
        queryType: "accessible",
        ownerTypeFilter: "dynamic-client-registration",
      }),
    ).toEqual({ owner_type: "user" });
    // An organization page always preselects its organization.
    expect(
      preferredResourceOwnershipForList({
        ...base,
        queryType: "org",
        organization_id: "org-a",
        ownerTypeFilter: "platform",
      }),
    ).toEqual({ owner_type: "organization", owner_organization_id: "org-a" });
  });
});
