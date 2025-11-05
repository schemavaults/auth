
import type {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely'
import type { AuthorizedAppDeclaration } from "./authorized-apps-registry";

export type AuthorizedAppsTable = AuthorizedAppDeclaration & {
  user_app_authorization_id: Generated<'user_app_authorization_id'>
};

export type AuthorizedApp = Selectable<AuthorizedAppsTable>;
export type NewAuthorizedApp = Insertable<AuthorizedAppsTable>;
export type AuthorizedAppUpdate = Updateable<AuthorizedAppsTable>;
