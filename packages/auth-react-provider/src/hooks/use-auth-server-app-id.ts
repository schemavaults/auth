"use client";

import { useContext } from "react";
import type { AppId } from "@schemavaults/app-definitions";
import AuthServerAppIdContext from "@/contexts/auth-server-app-id-context";

/**
 * @description Returns the auth server deployment's own app id (env-var
 * driven for white-label deployments). Defaults to "schemavaults-auth" when
 * no AuthServerAppIdProvider is mounted (e.g. in external resource servers).
 */
export function useAuthServerAppId(): AppId {
  return useContext(AuthServerAppIdContext);
}

export default useAuthServerAppId;
