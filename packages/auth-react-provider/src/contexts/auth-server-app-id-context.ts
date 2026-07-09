"use client";

import {
  type AppId,
  DEFAULT_AUTH_SERVER_APP_ID,
} from "@schemavaults/app-definitions";
import { createContext } from "react";

/**
 * @description The auth server deployment's own app id (env-var driven for
 * white-label deployments, e.g. "acme-corp-auth"). Client components cannot
 * read the SCHEMAVAULTS_AUTH_SERVER_APP_ID environment variable directly, so
 * the resolved value is provided via this context; it defaults to
 * "schemavaults-auth" when no provider is mounted (e.g. in external resource
 * servers).
 */
export const AuthServerAppIdContext = createContext<AppId>(
  DEFAULT_AUTH_SERVER_APP_ID,
);
export default AuthServerAppIdContext;
