export const validAuthenticationOutcomeTypes = [
  "login",
  "register",
  "reset-password",
] as const satisfies readonly string[];

export type AuthenticationOutcomeType =
  (typeof validAuthenticationOutcomeTypes)[number];

export function isValidAuthenticationOutcomeType(
  value: unknown,
): value is AuthenticationOutcomeType {
  if (typeof value === "string") {
    const validValues: readonly string[] = validAuthenticationOutcomeTypes;
    if (validValues.includes(value)) {
      return true;
    }
  }

  return false;
}
