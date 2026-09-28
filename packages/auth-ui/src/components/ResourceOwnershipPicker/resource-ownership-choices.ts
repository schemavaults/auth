import type { RequestedResourceOwnership } from "@schemavaults/app-definitions";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";

/**
 * The owner types a create dialog can offer. Dynamically registered clients
 * are never requested through the create dialogs (only
 * `POST /api/oidc/register` creates them).
 */
export type CreatableResourceOwnerType = RequestedResourceOwnership["owner_type"];

/** Display order of the owner options in the create dialogs. */
export const CREATABLE_RESOURCE_OWNER_TYPES = [
  "user",
  "organization",
  "platform",
] as const satisfies readonly CreatableResourceOwnerType[];

/**
 * The owner a create dialog preselects: derived from where the dialog was
 * opened (the admin console → platform, an organization page → that
 * organization, the `/apps` / `/apis` pages → the viewer's account). The
 * viewer can pick another owner in the dialog.
 */
export type PreferredResourceOwnership =
  | { owner_type: "user" }
  | { owner_type: "organization"; owner_organization_id?: string | null }
  | { owner_type: "platform" };

/** An organization the viewer can pick as the owner of a new resource. */
export interface ResourceOwnershipOrganizationChoice {
  organization_id: string;
  /** Display name; `null` when unknown (the id is shown instead). */
  organization_name: string | null;
}

/**
 * Why an owner option is offered but cannot be picked:
 * - `personal-creation-disabled`: the `allow_user_owned_resource_creation`
 *   server setting is off (and the viewer is not a global admin).
 * - `account-loading`: the viewer's user id is not known yet.
 * - `organizations-loading` / `organizations-error`: the viewer's
 *   organization memberships are still loading / failed to load.
 * - `not-organization-admin`: the viewer belongs to organizations, but is
 *   not an owner/admin of any of them.
 * - `no-organizations`: the viewer does not belong to any organization.
 */
export type ResourceOwnershipUnavailableReason =
  | "personal-creation-disabled"
  | "account-loading"
  | "organizations-loading"
  | "organizations-error"
  | "not-organization-admin"
  | "no-organizations";

/**
 * Whether an owner option is shown, and whether it can be picked. Options
 * the viewer can never use (platform ownership for non-admins) are hidden;
 * options they could use under other circumstances are shown disabled with
 * the reason.
 */
export type ResourceOwnershipOptionState =
  | { status: "available" }
  | { status: "disabled"; reason: ResourceOwnershipUnavailableReason }
  | { status: "hidden" };

export interface ResourceOwnershipChoices {
  user: ResourceOwnershipOptionState;
  organization: ResourceOwnershipOptionState;
  platform: ResourceOwnershipOptionState;
  /** The organizations the viewer may create resources for. */
  organizations: readonly ResourceOwnershipOrganizationChoice[];
}

export interface ComputeResourceOwnershipChoicesInput {
  /** Global admins may create resources for any owner. */
  isGlobalAdmin: boolean;
  /** The viewer's user id; `null` while unknown. */
  currentUserUid: string | null;
  /**
   * Whether the viewer may create personal (user-owned) resources: the
   * `allow_user_owned_resource_creation` server setting, which global
   * admins are exempt from.
   */
  allowPersonal: boolean;
  /** The viewer's organization memberships (`useMyOrganizations()`). */
  memberships: readonly OrganizationMembershipRoleDetails[] | undefined;
  membershipsLoading: boolean;
  membershipsError: boolean;
  /**
   * The platform's virtual organization; never offered as an organization
   * owner (platform ownership is its own option).
   */
  platformOrganizationId: string;
  /**
   * The organization the dialog was opened for (an organization page whose
   * viewer may manage it). Offered even when the viewer is not a member of
   * it (global admins).
   */
  contextOrganization?: ResourceOwnershipOrganizationChoice;
}

/**
 * @description Works out which owners a create dialog offers the viewer,
 * mirroring the server's rules (`resolveRequestedOwnershipForCreation`):
 * personal ownership needs the `allow_user_owned_resource_creation`
 * setting (global admins are exempt), organization ownership needs the
 * owner/admin role in that organization (global admins may use any), and
 * platform ownership is for global admins only.
 */
export function computeResourceOwnershipChoices(
  input: ComputeResourceOwnershipChoicesInput,
): ResourceOwnershipChoices {
  const allowPersonal: boolean = input.isGlobalAdmin || input.allowPersonal;
  let user: ResourceOwnershipOptionState;
  if (!allowPersonal) {
    user = { status: "disabled", reason: "personal-creation-disabled" };
  } else if (!input.currentUserUid) {
    user = { status: "disabled", reason: "account-loading" };
  } else {
    user = { status: "available" };
  }

  // The platform's virtual membership (global admins) is not an
  // organization owner: platform ownership is its own option.
  const organizationMemberships: readonly OrganizationMembershipRoleDetails[] =
    (input.memberships ?? []).filter(
      (m) => m.organization_id !== input.platformOrganizationId,
    );
  const organizations: ResourceOwnershipOrganizationChoice[] = [];
  const seen = new Set<string>();
  if (
    input.contextOrganization &&
    input.contextOrganization.organization_id !== input.platformOrganizationId
  ) {
    const membership = organizationMemberships.find(
      (m) => m.organization_id === input.contextOrganization?.organization_id,
    );
    organizations.push({
      organization_id: input.contextOrganization.organization_id,
      organization_name:
        input.contextOrganization.organization_name ??
        membership?.organization_name ??
        null,
    });
    seen.add(input.contextOrganization.organization_id);
  }
  for (const membership of organizationMemberships) {
    if (seen.has(membership.organization_id)) {
      continue;
    }
    if (
      !input.isGlobalAdmin &&
      membership.role !== "owner" &&
      membership.role !== "admin"
    ) {
      continue;
    }
    organizations.push({
      organization_id: membership.organization_id,
      organization_name: membership.organization_name,
    });
    seen.add(membership.organization_id);
  }

  let organization: ResourceOwnershipOptionState;
  if (organizations.length > 0) {
    organization = { status: "available" };
  } else if (input.membershipsLoading && !input.memberships) {
    organization = { status: "disabled", reason: "organizations-loading" };
  } else if (input.membershipsError && !input.memberships) {
    organization = { status: "disabled", reason: "organizations-error" };
  } else if (organizationMemberships.length > 0) {
    organization = { status: "disabled", reason: "not-organization-admin" };
  } else {
    organization = { status: "disabled", reason: "no-organizations" };
  }

  const platform: ResourceOwnershipOptionState = input.isGlobalAdmin
    ? { status: "available" }
    : { status: "hidden" };

  return { user, organization, platform, organizations };
}

/**
 * @description Whether any owner can be picked, i.e. whether a create
 * dialog could submit at all.
 */
export function hasAvailableResourceOwnership(
  choices: ResourceOwnershipChoices,
): boolean {
  return CREATABLE_RESOURCE_OWNER_TYPES.some(
    (owner_type) => choices[owner_type].status === "available",
  );
}

/**
 * The owner picked in a create dialog. `owner_organization_id` is the
 * chosen organization when `owner_type` is `organization` (`null` until one
 * is chosen) and always `null` otherwise.
 */
export interface ResourceOwnershipSelection {
  owner_type: CreatableResourceOwnerType;
  owner_organization_id: string | null;
}

/**
 * @description Whether a selection can still be submitted as picked: its
 * owner option is available and its organization (if already chosen) is
 * one the viewer may create resources for.
 */
export function isResourceOwnershipSelectionAvailable(
  selection: ResourceOwnershipSelection,
  choices: ResourceOwnershipChoices,
): boolean {
  if (choices[selection.owner_type].status !== "available") {
    return false;
  }
  if (
    selection.owner_type === "organization" &&
    selection.owner_organization_id !== null
  ) {
    return choices.organizations.some(
      (o) => o.organization_id === selection.owner_organization_id,
    );
  }
  return true;
}

/**
 * @description The organization preselected when the organization owner is
 * picked: the preferred one when the viewer may use it, the only one when
 * there is exactly one, and none (the viewer must choose) otherwise.
 */
export function defaultOrganizationForSelection(
  choices: ResourceOwnershipChoices,
  preferred_organization_id?: string | null,
): string | null {
  if (
    preferred_organization_id &&
    choices.organizations.some(
      (o) => o.organization_id === preferred_organization_id,
    )
  ) {
    return preferred_organization_id;
  }
  const [only, ...rest] = choices.organizations;
  return only && rest.length === 0 ? only.organization_id : null;
}

/**
 * @description The owner a create dialog preselects: the preferred owner
 * when the viewer may use it, otherwise the first available option (in
 * {@link CREATABLE_RESOURCE_OWNER_TYPES} order). `null` when no owner is
 * available at all.
 */
export function resolveDefaultResourceOwnershipSelection(
  preferred: PreferredResourceOwnership,
  choices: ResourceOwnershipChoices,
): ResourceOwnershipSelection | null {
  const owner_type: CreatableResourceOwnerType | undefined =
    choices[preferred.owner_type].status === "available"
      ? preferred.owner_type
      : CREATABLE_RESOURCE_OWNER_TYPES.find(
          (candidate) => choices[candidate].status === "available",
        );
  if (!owner_type) {
    return null;
  }
  if (owner_type !== "organization") {
    return { owner_type, owner_organization_id: null };
  }
  return {
    owner_type,
    owner_organization_id: defaultOrganizationForSelection(
      choices,
      preferred.owner_type === "organization"
        ? preferred.owner_organization_id
        : null,
    ),
  };
}

/**
 * @description Turns the owner picked in a create dialog into the ownership
 * of the creation request. `null` when the selection is incomplete (no
 * organization chosen yet, or the viewer's user id is unknown).
 */
export function resourceOwnershipSelectionToRequestedOwnership(
  selection: ResourceOwnershipSelection,
  currentUserUid: string | null,
): RequestedResourceOwnership | null {
  switch (selection.owner_type) {
    case "user":
      return currentUserUid
        ? { owner_type: "user", owner_uid: currentUserUid }
        : null;
    case "organization":
      return selection.owner_organization_id
        ? {
            owner_type: "organization",
            owner_organization_id: selection.owner_organization_id,
          }
        : null;
    case "platform":
      return { owner_type: "platform" };
  }
}

/**
 * @description One sentence naming the owner of a newly created resource,
 * e.g. for the success toast of a create dialog.
 */
export function describeRequestedResourceOwnership(
  ownership: RequestedResourceOwnership,
  choices: ResourceOwnershipChoices,
  friendlyName: string,
): string {
  switch (ownership.owner_type) {
    case "user":
      return "Owned by your account.";
    case "organization": {
      const organization = choices.organizations.find(
        (o) => o.organization_id === ownership.owner_organization_id,
      );
      return `Owned by ${organization?.organization_name ?? ownership.owner_organization_id}.`;
    }
    case "platform":
      return `Owned by the ${friendlyName} platform.`;
  }
}

/**
 * @description The owner a create button preselects, from the list it sits
 * on: the admin console's "all" list → platform, an organization's list →
 * that organization, the viewer's own ("owned" / "accessible") lists → the
 * viewer's account. An owner-type filter applied to the list takes
 * precedence, so e.g. `/apps` filtered to "Organization" preselects an
 * organization. `null` for lists that do not offer creation.
 */
export function preferredResourceOwnershipForList({
  queryType,
  organization_id,
  platformOrganizationId,
  ownerTypeFilter,
}: {
  queryType: string;
  organization_id?: string;
  platformOrganizationId: string;
  /** The list's owner-type filter (`OwnerTypeFilterValue`), if any. */
  ownerTypeFilter?: string;
}): PreferredResourceOwnership | null {
  const filtered: PreferredResourceOwnership | null =
    ownerTypeFilter === "user" ||
    ownerTypeFilter === "organization" ||
    ownerTypeFilter === "platform"
      ? { owner_type: ownerTypeFilter }
      : null;
  switch (queryType) {
    case "all":
      return filtered ?? { owner_type: "platform" };
    case "org":
      return organization_id && organization_id !== platformOrganizationId
        ? { owner_type: "organization", owner_organization_id: organization_id }
        : { owner_type: "platform" };
    case "owned":
    case "accessible":
      return filtered ?? { owner_type: "user" };
    default:
      return null;
  }
}
