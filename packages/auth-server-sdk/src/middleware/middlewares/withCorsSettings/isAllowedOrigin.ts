import {
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { isOriginInAllowedList } from "@schemavaults/auth-common";
import {
  type SchemaVaultsCORSEnforcementPolicy,
  SchemaVaultsCORSEnforcementPolicies as policies,
} from "./cors-policies";
import { JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME } from "@/env/loadJwksAccessPrivateKey";
import type { IAllowedOriginsResolver } from "./RemoteAllowedOriginsResolver";

interface CheckIfIsAllowedOriginOptions {
  origin: string | null | undefined;
  policy: SchemaVaultsCORSEnforcementPolicy;
  audience: string;
  environment: SchemaVaultsAppEnvironment;
  auth_server_url: string;
  allowed_origins_resolver?: IAllowedOriginsResolver;
  debug?: boolean;
}

async function enforceValidAppIfOriginApplied(
  opts: CheckIfIsAllowedOriginOptions,
): Promise<boolean> {
  const { origin, audience, allowed_origins_resolver, debug } = opts;
  if (!origin) {
    return true;
  }
  origin satisfies string;

  const auth_app_id = SCHEMAVAULTS_AUTH_APP_ID;
  const auth_server_url: string = opts.auth_server_url;

  if (
    audience === auth_app_id &&
    isOriginInAllowedList(origin, [auth_server_url])
  ) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that auth client application can reach auth server backend...",
      );
    }
    return true;
  }

  if (audience === auth_app_id) {
    // The auth server validates client-app origins itself with database
    // access (see auth-server's cors-for-client-app); the remote
    // allowed-origins lookup rejects the auth app id.
    console.warn(
      `[isAllowedOrigin] Origin "${origin}" is not the auth server's own origin; denying for audience '${auth_app_id}'.`,
    );
    return false;
  }

  if (!allowed_origins_resolver) {
    console.error(
      "[isAllowedOrigin] No allowed-origins resolver available to validate origin against the auth server; denying. " +
        "Pass 'allowed_origins_resolver' or use the default RemoteAllowedOriginsResolver.",
    );
    return false;
  }

  if (!allowed_origins_resolver.isConfigured()) {
    console.error(
      `[isAllowedOrigin] Allowed-origins resolver is not configured (is the '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' environment variable set?); denying origin "${origin}".`,
    );
    return false;
  }

  try {
    const allowedOrigins: readonly string[] =
      await allowed_origins_resolver.loadAllowedOrigins(audience);
    const allowed: boolean = isOriginInAllowedList(origin, allowedOrigins);
    if (debug) {
      console.log(
        `[isAllowedOrigin] Origin "${origin}" ${allowed ? "is" : "is not"} in the allowed-origins list for audience '${audience}' (${allowedOrigins.length} allowed origin${allowedOrigins.length === 1 ? "" : "s"})`,
      );
    }
    return allowed;
  } catch (e: unknown) {
    // Fail closed: if the allowed origins can't be determined, deny.
    console.error(
      `[isAllowedOrigin] Failed to load allowed origins for audience '${audience}'; denying origin "${origin}". Error: `,
      e,
    );
    return false;
  }
}

async function sameOriginIfOriginApplied(
  opts: CheckIfIsAllowedOriginOptions,
): Promise<boolean> {
  const { origin, audience, debug } = opts;
  if (!origin) {
    return true;
  }

  let parsedOrigin: URL;
  let parsedAudience: URL;
  try {
    parsedOrigin = new URL(origin);
    parsedAudience = new URL(audience);
  } catch {
    // "Same origin" is only meaningful when the audience is itself a URL
    // (e.g. the auth server); an api_server_id audience can't match.
    console.warn(
      `[isAllowedOrigin] Cannot compare origin "${origin}" to non-URL audience '${audience}' for same-origin policy; denying.`,
    );
    return false;
  }

  // Comparing URL.origin normalizes casing and default ports.
  const sameOrigin: boolean = parsedOrigin.origin === parsedAudience.origin;
  if (debug) {
    console.log(
      `[isAllowedOrigin] Origin "${origin}" ${sameOrigin ? "matches" : "does not match"} audience origin "${parsedAudience.origin}"`,
    );
  }
  return sameOrigin;
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
