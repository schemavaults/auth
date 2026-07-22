"use client";

import useCurrentUserWithRevalidation from "./use-current-user-swr";

export function useAdmin(): boolean {
  // Sessions restored from the refresh-token cookie alone (e.g. after local
  // storage was cleared, or a login performed outside this tab) have no
  // in-memory user data, so the revalidating hook's whoami fallback is
  // required for admin-gated UI to appear for them at all.
  const currentUser = useCurrentUserWithRevalidation();
  return currentUser?.admin ?? false;
}

export default useAdmin;
