import {
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type SchemaVaultsCORSEnforcementPolicy,
  SchemaVaultsCORSEnforcementPolicies as policies,
} from "./cors-policies";

interface CheckIfIsAllowedOriginOptions {
  origin: string | null | undefined;
  policy: SchemaVaultsCORSEnforcementPolicy;
  audience: string;
  environment: SchemaVaultsAppEnvironment;
  auth_server_url: string;
  debug?: boolean;
}

async function enforceValidAppIfOriginApplied(
  opts: CheckIfIsAllowedOriginOptions,
): Promise<boolean> {
  const { origin, audience, environment, debug } = opts;
  if (!origin) {
    return true;
  }
  origin satisfies string;

  const auth_app_id = SCHEMAVAULTS_AUTH_APP_ID;
  const auth_server_url: string = opts.auth_server_url;

  if (origin === auth_server_url && audience === auth_app_id) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that auth client application can reach auth server backend...",
      );
    }
    return true;
  }

  console.warn(
    "[isAllowedOrigin] This is only half implemented-- need to check if origin is valid for non-hardcoded API servers!",
  );

  return false;
}

async function sameOriginIfOriginApplied(
  opts: CheckIfIsAllowedOriginOptions,
): Promise<boolean> {
  const { origin, audience, environment, debug } = opts;
  if (!origin) {
    return true;
  }

  if (origin.startsWith("https://") && audience.startsWith("https://")) {
    if (origin === audience) {
      return true;
    }
  }

  throw new Error(
    "Unimplemented, need to do more thorough check to see if this origin is the same as this server audience",
  );
}

export async function isAllowedOrigin(
  opts: CheckIfIsAllowedOriginOptions,
): Promise<boolean> {
  const { policy, environment, debug } = opts;

  if (debug) {
    console.log("[isAllowedOrigin] Running with options: ", opts, environment);
  }

  switch (policy) {
    case policies.AllowAny:
      return true;

    case policies.EnforceValidAppIfOriginApplied:
      return await enforceValidAppIfOriginApplied(opts);

    case policies.SameOriginIfOriginApplied:
      return await sameOriginIfOriginApplied(opts);

    default:
      throw new Error(`Unimplemented CORS policy: ${policy}`);
  }
}

export default isAllowedOrigin;
