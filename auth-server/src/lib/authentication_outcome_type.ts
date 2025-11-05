import { z } from "zod";

export const authenticationOutcomeTypeSchema = z.enum([
  "login",
  "register",
  "reset-password",
] as const);

export type AuthenticationOutcomeType = z.infer<
  typeof authenticationOutcomeTypeSchema
>;

export function isValidAuthenticationOutcomeType(
  value: unknown,
): value is AuthenticationOutcomeType {
  return authenticationOutcomeTypeSchema.safeParse(value).success;
}

export const onSuccessfulAuthenticateActionSchema = z.enum([
  "redirect-with-authorization-code",
  "send-authorization-code-to-native-app-then-close",
  "account-page",
] as const);

export type OnSuccessfulAuthenticateAction = z.infer<
  typeof onSuccessfulAuthenticateActionSchema
>;
