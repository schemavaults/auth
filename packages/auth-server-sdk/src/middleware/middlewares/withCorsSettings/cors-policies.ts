const validSchemaVaultsCorsEnforcementPolicies = [
  "AllowAny",
  "EnforceValidAppIfOriginApplied",
  "SameOriginIfOriginApplied",
] as const satisfies readonly string[];

export type SchemaVaultsCORSEnforcementPolicy =
  (typeof validSchemaVaultsCorsEnforcementPolicies)[number];

export function isValidCORSEnforcementPolicy(
  policy: string,
): policy is SchemaVaultsCORSEnforcementPolicy {
  if (typeof policy === "string") {
    const validPolicies: readonly string[] =
      validSchemaVaultsCorsEnforcementPolicies;
    if (validPolicies.includes(policy)) {
      return true;
    }
  }
  return false;
}

type AvailableCorsPoliciesAccessorObject = Readonly<{
  [K in SchemaVaultsCORSEnforcementPolicy]: K;
}>;

export const SchemaVaultsCORSEnforcementPolicies: AvailableCorsPoliciesAccessorObject =
  {
    EnforceValidAppIfOriginApplied: "EnforceValidAppIfOriginApplied",
    AllowAny: "AllowAny",
    SameOriginIfOriginApplied: "SameOriginIfOriginApplied",
  } as const;

export default SchemaVaultsCORSEnforcementPolicies;
