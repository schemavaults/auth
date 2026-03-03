"use client";

import { useContext, type ReactNode } from "react";
import type { SchemaVaultsAuthProviderProps } from "./auth-provider-props";
import useAutoReacquireDefaultAccessTokens from "@/hooks/use-auto-reacquire-default-access-tokens";
import AuthClientMiddlewareManager from "./auth-client-middleware-manager";
import { AuthMiddlewareRules } from "@schemavaults/auth-common";
import SchemaVaultsAuthContext from "@/contexts/auth-client-context";
import { AuthMiddlewareRulesBuilderFn } from "@/types/AuthMiddlewareRulesBuilderFn";
import resolveClientAuthMiddlewareRules from "@/lib/resolveClientAuthMiddlewareRules";

export interface AuthSideEffectsProps
  extends Omit<SchemaVaultsAuthProviderProps, "children"> {
  debug: boolean;
}

function AutoReacquireAccessTokens(): null {
  useAutoReacquireDefaultAccessTokens();
  return null;
}

export default function AuthProviderSideEffects(
  props: AuthSideEffectsProps,
): ReactNode {
  const ready: boolean = useContext(SchemaVaultsAuthContext).ready;

  const authMiddlewareRules: AuthMiddlewareRules | undefined =
    resolveClientAuthMiddlewareRules(props.authMiddlewareRules);

  const auto_reacquire: boolean =
    props.autoreacquire_access_tokens &&
    Array.isArray(props.default_audiences) &&
    props.default_audiences.length > 0
      ? true
      : false;

  if (!ready) {
    return null;
  }

  return (
    <>
      {authMiddlewareRules && (
        <AuthClientMiddlewareManager
          {...props}
          authMiddlewareRules={authMiddlewareRules}
        />
      )}
      {auto_reacquire && <AutoReacquireAccessTokens />}
    </>
  );
}
