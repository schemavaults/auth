import {
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_MAIL_APP_DEFINITION,
  SCHEMAVAULTS_REGISTRY_SERVER,
  SCHEMAVAULTS_WEB,
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

  const auth_app_id = SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;
  const auth_server_uri: string = getHardcodedClientWebAppDomain(
    auth_app_id,
    environment,
  );

  if (origin === auth_server_uri && audience === auth_app_id) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that auth client application can reach auth server backend...",
      );
    }
    return true;
  }

  const web_app_id = SCHEMAVAULTS_WEB.app_id;
  const web_app_uri: string = getHardcodedClientWebAppDomain(
    web_app_id,
    environment,
  );

  // Allow https://schemavaults.com to reach https://auth.schemavaults.com
  if (origin === web_app_uri && audience === auth_app_id) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that @schemavaults/web application can reach auth server backend...",
      );
    }
    return true;
  }

  if (origin === web_app_uri && audience.startsWith("schemavaults-fs:")) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that @schemavaults/web application can reach vault fileserver backend...",
      );
    }
    return true;
  }

  // Ensure that https://api.schemavaults.com can be accessed by the core web app
  const registry_app_id = SCHEMAVAULTS_REGISTRY_SERVER.api_server_id;
  if (origin === web_app_uri && audience === registry_app_id) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that @schemavaults/web application can reach registry API server backend...",
      );
    }
    return true;
  }

  // Ensure that https://mail.schemavaults.com can be accessed by the core web app
  const mail_app_id = SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id;
  if (origin === web_app_uri && audience === mail_app_id) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that @schemavaults/web application can reach mail API server backend...",
      );
    }
    return true;
  }

  const mail_app_uri: string = getHardcodedClientWebAppDomain(
    mail_app_id,
    environment,
  );

  // Allow https://mail.schemavaults.com to reach https://auth.schemavaults.com
  if (origin === mail_app_uri && audience === auth_app_id) {
    if (debug) {
      console.log(
        "[isAllowedOrigin] Ensuring that @schemavaults/mail-server application can reach auth server backend...",
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

  let hardcoded_app_uri: string | undefined;
  try {
    hardcoded_app_uri = getHardcodedClientWebAppDomain(audience, environment);
  } catch (e: unknown) {
    void e; /** no-op, this app may not be a hardcoded app */
  }

  if (typeof hardcoded_app_uri === "string") {
    if (origin === hardcoded_app_uri) {
      return true;
    } else {
      if (debug) {
        console.warn(
          `[isAllowedOrigin] Denying due to mismatch between request origin and hardcoded app domain on record: ('${hardcoded_app_uri}')`,
        );
      }
      return false;
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
