import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { UserDocument } from "./user-registry";

/**
 * The USERS columns added by migration 00036 are nullable TEXT in
 * Postgres. UserDocument surfaces them as `string | undefined` (NULL is
 * normalized away by parseUserDocument), so they are re-declared here
 * with `null` so selects type raw NULLs correctly and updates can write
 * NULL to clear a value.
 */
type NullableProfileNameColumns = {
  username?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
};

export type UsersTable = Omit<
  UserDocument,
  keyof NullableProfileNameColumns
> &
  NullableProfileNameColumns;

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
