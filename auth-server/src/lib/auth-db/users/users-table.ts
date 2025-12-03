import type {
  Insertable,
  Selectable,
  Updateable,
} from "kysely";
import type { UserDocument } from "./user-registry";

export type UsersTable = UserDocument;

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
