import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  isValidOrganizationID,
  type ResourceOwnership,
  type ResourceOwnershipFields,
} from "@schemavaults/app-definitions";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { isUserInOrganization } from "@/lib/isUserInOrganization";
import allowUserOwnedResourceCreation from "@/lib/config/allow-user-owned-resource-creation";

export type ResolveRequestedOwnershipResult =
  | { ok: true; ownership: ResourceOwnership }
  | { ok: false; status: 400 | 403; message: string };

/**
 * @description Works out who a newly created app/API server should belong to
 * from the ownership fields of a creation request, and checks that the
 * caller is allowed to create resources for that owner.
 *
 * Request interpretation (an explicit `owner_type` always wins):
 * - `owner_type: "user"` (or an `owner_uid`) → owned by the caller. Callers
 *   may only create resources for themselves, and the
 *   `allow_user_owned_resource_creation` server setting must be enabled
 *   (global admins are exempt from the setting).
 * - `owner_type: "organization"` (or an `owner_organization_id` other than
 *   the platform's virtual organization) → owned by that organization; the
 *   caller must be one of its owners/admins, or a global admin.
 * - `owner_type: "platform"` (or the platform's virtual organization as the
 *   `owner_organization_id`) → platform-owned; global admins only.
 * - No ownership fields at all → platform-owned for global admins (the
 *   historical behaviour of the admin console), user-owned otherwise.
 */
export async function resolveRequestedOwnershipForCreation(
  db: Kysely<AuthDatabase>,
  user: UserData,
  requested: ResourceOwnershipFields,
  redis?: Redis,
): Promise<ResolveRequestedOwnershipResult> {
  const platformOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();
  const isGlobalAdmin: boolean = user.admin === true;

  const owner_organization_id: string | null =
    typeof requested.owner_organization_id === "string" &&
    requested.owner_organization_id.length > 0
      ? requested.owner_organization_id
      : null;
  const owner_uid: string | null =
    typeof requested.owner_uid === "string" && requested.owner_uid.length > 0
      ? requested.owner_uid
      : null;

  let owner_type: ResourceOwnership["owner_type"];
  if (requested.owner_type) {
    owner_type = requested.owner_type;
  } else if (owner_uid) {
    owner_type = "user";
  } else if (owner_organization_id && owner_organization_id !== platformOrganizationId) {
    owner_type = "organization";
  } else if (owner_organization_id === platformOrganizationId) {
    owner_type = "platform";
  } else {
    owner_type = isGlobalAdmin ? "platform" : "user";
  }

  switch (owner_type) {
    case "platform": {
      if (owner_uid || (owner_organization_id && owner_organization_id !== platformOrganizationId)) {
        return {
          ok: false,
          status: 400,
          message: "A platform-owned resource cannot also name a user or organization owner",
        };
      }
      if (!isGlobalAdmin) {
        return {
          ok: false,
          status: 403,
          message: "You must be an admin to create a platform-owned resource",
        };
      }
      return {
        ok: true,
        ownership: {
          owner_type: "platform",
          owner_organization_id: platformOrganizationId,
          owner_uid: null,
        },
      };
    }

    case "organization": {
      if (!owner_organization_id) {
        return {
          ok: false,
          status: 400,
          message: "An organization-owned resource requires an 'owner_organization_id'",
        };
      }
      if (owner_uid) {
        return {
          ok: false,
          status: 400,
          message: "An organization-owned resource cannot also name an 'owner_uid'",
        };
      }
      if (!isValidOrganizationID(owner_organization_id)) {
        return { ok: false, status: 400, message: "Invalid 'owner_organization_id'" };
      }
      if (owner_organization_id === platformOrganizationId) {
        return {
          ok: false,
          status: 400,
          message: "The platform organization cannot own organization-owned resources; use owner_type 'platform'",
        };
      }
      if (!isGlobalAdmin) {
        const role = await isUserInOrganization(db, user, owner_organization_id);
        if (role !== "owner" && role !== "admin") {
          return {
            ok: false,
            status: 403,
            message: "You must be an owner or admin of the organization to create resources for it",
          };
        }
      }
      return {
        ok: true,
        ownership: {
          owner_type: "organization",
          owner_organization_id,
          owner_uid: null,
        },
      };
    }

    case "user": {
      if (owner_organization_id) {
        return {
          ok: false,
          status: 400,
          message: "A user-owned resource cannot also name an 'owner_organization_id'",
        };
      }
      if (owner_uid && owner_uid !== user.uid) {
        return {
          ok: false,
          status: 403,
          message: "You can only create resources owned by your own account",
        };
      }
      if (!isGlobalAdmin) {
        const allowed: boolean = await allowUserOwnedResourceCreation(db, redis);
        if (!allowed) {
          return {
            ok: false,
            status: 403,
            message: "Creating your own applications and API servers is disabled on this server; ask an administrator or create them through an organization",
          };
        }
      }
      return {
        ok: true,
        ownership: {
          owner_type: "user",
          owner_organization_id: null,
          owner_uid: user.uid,
        },
      };
    }
  }
}

export default resolveRequestedOwnershipForCreation;
