"use client";

import AuthServerAppIdContext from "@/contexts/auth-server-app-id-context";
import {
  type AppId,
  appIdSchema,
  DEFAULT_AUTH_SERVER_APP_ID,
} from "@schemavaults/app-definitions";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";

export interface AuthServerAppIdProviderProps extends PropsWithChildren {
  /**
   * The auth server deployment's own app id, resolved server-side from the
   * SCHEMAVAULTS_AUTH_SERVER_APP_ID environment variable. Defaults to
   * "schemavaults-auth" when omitted.
   */
  auth_server_app_id?: AppId;
}

export default function AuthServerAppIdProvider({
  auth_server_app_id,
  children,
}: AuthServerAppIdProviderProps): ReactElement {
  const validated_auth_server_app_id: AppId = useMemo(() => {
    if (
      typeof auth_server_app_id !== "string" ||
      auth_server_app_id.length === 0
    ) {
      return DEFAULT_AUTH_SERVER_APP_ID;
    }
    const parsed = appIdSchema.safeParse(auth_server_app_id);
    if (!parsed.success) {
      throw new TypeError(
        "Invalid auth server app ID for @schemavaults/auth-react-provider!",
      );
    }
    return parsed.data;
  }, [auth_server_app_id]);

  return (
    <AuthServerAppIdContext.Provider value={validated_auth_server_app_id}>
      {children}
    </AuthServerAppIdContext.Provider>
  );
}
