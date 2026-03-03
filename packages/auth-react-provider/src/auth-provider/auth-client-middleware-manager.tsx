"use client";

import type { ReactNode } from "react";
import useAuthClientMiddleware from "@/hooks/use-auth-client-middleware";
import type { SchemaVaultsAuthProviderProps } from "./auth-provider-props";
import { defaultAuthMiddlewareRules } from "@schemavaults/auth-common";
import { useRouter } from "next/navigation";
import {
  useAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@/hooks/use-app-environment";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "@/hooks/use-debug";

export function AuthClientMiddlewareManager(
  props: Omit<
    SchemaVaultsAuthProviderProps,
    "children" | "authMiddlewareRules"
  > &
    Required<Pick<SchemaVaultsAuthProviderProps, "authMiddlewareRules">>,
): ReactNode {
  const router = useRouter();

  const {
    // auth_server_uri,
    // successful_authentication_redirect_uri,
    successful_logout_redirect_uri,
    // app_id,
    path,
    authMiddlewareRules,
    authed_on_unauthed_redirect_uri,
    unauthed_on_authed_redirect_uri,
  } = props;

  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    props.debug,
  );

  if (!authed_on_unauthed_redirect_uri) {
    throw new Error(
      "[SchemaVaultsAuthProvider] authed_on_unauthed_redirect_uri is required.",
    );
  } else if (!unauthed_on_authed_redirect_uri) {
    throw new Error(
      "[SchemaVaultsAuthProvider] unauthed_on_authed_redirect_uri is required.",
    );
  }

  const authorize_uri: string = props.authorize_uri ?? "/auth/authorize";

  if (!authMiddlewareRules || typeof authMiddlewareRules !== "object") {
    throw new TypeError(
      "AuthClientMiddlewareManager did not receive an 'authMiddlewareRules' object!",
    );
  }

  // Watch for changes in auth state via authClientRef, redirect if necessary
  useAuthClientMiddleware({
    authMiddlewareRules,
    path,
    router,
    unauthed_on_authed_redirect_uri,
    authed_on_unauthed_redirect_uri,
    authorize_uri,
    successful_logout_redirect_uri,
    debug,
  });

  return null;
}

export default AuthClientMiddlewareManager;
