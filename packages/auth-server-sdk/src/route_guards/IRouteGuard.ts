import type { UserData } from "@schemavaults/auth-common";

export interface IRouteGuard {
  isAccessAllowed: () => boolean;
  user: UserData | null;
}
