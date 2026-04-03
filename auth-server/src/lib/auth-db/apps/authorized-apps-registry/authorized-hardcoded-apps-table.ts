import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "@schemavaults/dbh";

export type AuthorizedHardcodedAppsTable = {
  user_hardcoded_app_authorization_id: Generated<"user_hardcoded_app_authorization_id">;
  app_id: string;
  uid: string;
  authorized_at: number;
};

export type AuthorizedHardcodedApp = Selectable<AuthorizedHardcodedAppsTable>;
export type NewAuthorizedHardcodedApp = Insertable<AuthorizedHardcodedAppsTable>;
export type AuthorizedHardcodedAppUpdate = Updateable<AuthorizedHardcodedAppsTable>;
