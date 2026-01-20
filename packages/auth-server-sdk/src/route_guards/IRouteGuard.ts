import type { OrganizationID, UserData } from "@schemavaults/auth-common";

export interface IRouteGuard {
  isAccessAllowed: () => boolean;
  user: UserData | null;
  user_organizations: readonly OrganizationID[];
}
