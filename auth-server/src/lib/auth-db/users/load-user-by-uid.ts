import { type UserData, userDataSchema } from "@schemavaults/auth-common";
import type { UserRegistry } from "./user-registry";

export async function loadUserData(uid: string, userRegistry: UserRegistry): Promise<UserData> {
  // Load user data from the database
  const user = await userRegistry.getUserByUID(uid);
  if (!user) throw new Error(`User not found with uid ${uid}`);

  // Make sure the user data is valid
  const parsed = await userDataSchema.safeParseAsync({
    uid: user.uid,
    sub: user.uid,
    email: user.email,
    email_verified: user.email_verified ?? false,
    created_at: user.created_at,
    admin: user.admin ?? false,
    disabled: user.disabled ?? false,
    invite_code: user.invite_code,
    username: user.username,
    first_name: user.first_name,
    middle_name: user.middle_name,
    last_name: user.last_name,
    display_name: user.display_name,
  } satisfies UserData)

  if (!parsed.success) throw new Error(`Invalid user data for uid ${uid}`);
  return parsed.data;
}
