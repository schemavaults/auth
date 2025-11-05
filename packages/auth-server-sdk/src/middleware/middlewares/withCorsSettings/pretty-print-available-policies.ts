import {
  SchemaVaultsCORSEnforcementPolicies as policies,
  SchemaVaultsCORSEnforcementPolicy,
} from "./cors-policies";

function wrapWithQuotes<S extends string>(policyName: S): `"${S}"` {
  return `"${policyName}"`;
}

export function prettyPrintAvailablePolicies(): string {
  const policy_names: readonly SchemaVaultsCORSEnforcementPolicy[] =
    Object.values(policies);

  const n_policies: number = policy_names.length;
  if (n_policies === 0) {
    throw new Error("Failed to load available CORS policies!");
  } else if (n_policies === 1) {
    return wrapWithQuotes(policy_names[0]);
  }

  console.assert(
    n_policies >= 2,
    "Expected there to be at least 2 CORS policies to print if this point was reached!",
  );

  const quotationWrapped: readonly string[] = policy_names.map(
    (policyName: SchemaVaultsCORSEnforcementPolicy): string =>
      wrapWithQuotes(policyName),
  );

  const lastIndex: number = n_policies - 1;

  let output: string = "";
  quotationWrapped.forEach((policyName: string, index: number) => {
    if (index === 0) {
      output += policyName;
    } else {
      output += ", ";
      if (index === lastIndex) {
        output += "or ";
      }
      output += policyName;
    }
  });
  return output satisfies string;
}
