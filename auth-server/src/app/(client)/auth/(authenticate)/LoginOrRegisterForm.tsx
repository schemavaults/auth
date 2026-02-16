"use client";

import AuthForm from "@/components/AuthForm";
import {
  type AuthenticationOutcomeType,
  isValidAuthenticationOutcomeType,
  type OnSuccessfulAuthenticateAction,
} from "@/lib/authentication_outcome_type";
import { ThemedPageBackground } from "@schemavaults/ui";
import type { ReactElement } from "react";
import isValidOnSuccessfulAuthenticateAction from "./isValidOnSuccessfulAuthenticateAction";

export interface PartialAppInfo {
  app_id: string;
  app_name: string;
  app_description: string;
}

export interface CredentialsFormViewProps {
  type: AuthenticationOutcomeType;
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  invite_code_required?: boolean;
  debug?: boolean;
  app?: PartialAppInfo | null;
}

/**
 * @name LoginOrRegisterForm
 * @description Render a sign-in form or the registration form (add confirm password + invite code fields)
 */
export function LoginOrRegisterForm({
  type,
  onSuccessfulAuthenticate,
  ...props
}: CredentialsFormViewProps): ReactElement {
  if (!isValidAuthenticationOutcomeType(type)) {
    throw new Error("Invalid authentication type! Expected one of ");
  } else if (type === "reset-password") {
    throw new Error(
      "Resetting password is not handled by this form component!",
    );
  }

  if (!isValidOnSuccessfulAuthenticateAction(onSuccessfulAuthenticate)) {
    throw new Error(
      "Invalid action to run after successful authentication specified!",
    );
  }

  return (
    <ThemedPageBackground
      className="items-center justify-center flex"
      backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
    >
      <AuthForm
        type={type}
        onSuccessfulAuthenticate={onSuccessfulAuthenticate}
        invite_code_required={typeof props.invite_code_required === 'boolean' ? props.invite_code_required : true}
        debug={props.debug}
        app={props.app}
      />
    </ThemedPageBackground>
  );
}

export default LoginOrRegisterForm;
