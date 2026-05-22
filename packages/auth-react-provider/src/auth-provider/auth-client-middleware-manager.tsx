"use client";

import type { ReactNode } from "react";
import useAuthClientMiddleware from "@/hooks/use-auth-client-middleware";
import type { SchemaVaultsAuthProviderProps } from "@/types/SchemaVaultsAuthProviderProps";
import { useRouter } from "next/navigation";
import {
  useAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@/hooks/use-app-environment";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "@/hooks/use-debug";
import type { IAuthProviderRedirectUrlConfigurationWithDefaultsSet } from "@/types/IAuthProviderRedirectUrlConfiguration";
import useRedirectUrlConfiguration from "@/hooks/use-redirect-url-configuration";

export function AuthClientMiddlewareManager(
  props: Omit<
    SchemaVaultsAuthProviderProps,
    | "children"
    | "authMiddlewareRules"
    | keyof IAuthProviderRedirectUrlConfigurationWithDefaultsSet
  > &
    Required<Pick<SchemaVaultsAuthProviderProps, "authMiddlewareRules">>,
): ReactNode {
  const router = useRouter();
  const {
    authorize_uri,
    successful_logout_redirect_uri,
    authed_on_unauthed_redirect_uri,
    unauthed_on_authed_redirect_uri,
  } = useRedirectUrlConfiguration();

  const { path, authMiddlewareRules } = props;

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
    debug,
  });

  return null;
}

export default AuthClientMiddlewareManager;
