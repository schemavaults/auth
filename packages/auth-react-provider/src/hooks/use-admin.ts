"use client";

import useCurrentUser from "./use-current-user";

export function useAdmin(): boolean {
  const currentUser = useCurrentUser();
  return currentUser?.admin ?? false;
}

export default useAdmin;
