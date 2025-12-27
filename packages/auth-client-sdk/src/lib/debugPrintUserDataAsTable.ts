import type { UserData } from "@schemavaults/auth-common";

export default function debugPrintUserDataAsTable(userData: UserData): void {
  try {
    console.groupCollapsed("User Data");
    console.table(userData);
    console.groupEnd();
  } catch (e: unknown) {
    console.warn("Error printing user data as a table: ", e);
  }
  return;
}
