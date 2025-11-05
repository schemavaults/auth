import {
  type SchemaVaultsCORSEnforcementPolicy,
  SchemaVaultsCORSEnforcementPolicies as corsPolicies,
} from "./cors-policies";

interface ApplyCorsHeadersOptions {
  origin: string | null | undefined;
  headers: Record<string, string>;
  policy: SchemaVaultsCORSEnforcementPolicy;
  preflight?: boolean;
  method: string;
  debug?: boolean;
  allowed: boolean;
}

export function applyCorsHeaders(
  opts: ApplyCorsHeadersOptions,
): Record<string, string> {
  const withCorsHeaders: Record<string, string> = { ...opts.headers };

  const DEBUG: boolean = opts.debug ?? false;
  const allowed = opts.allowed;
  if (!allowed)
    throw new Error(
      "applyCorsHeaders() should not be called until this origin has been validated as allowed",
    );

  if (DEBUG) {
    console.log(
      `[applyCorsHeaders] Applying ${opts.preflight ? "preflight " : ""}CORS headers for policy "${opts.policy}".`,
    );
  }

  switch (opts.policy) {
    case corsPolicies.AllowAny:
      withCorsHeaders["Access-Control-Allow-Origin"] = "*";
      break;
    case corsPolicies.EnforceValidAppIfOriginApplied:
      if (typeof opts.origin === "string") {
        withCorsHeaders["Access-Control-Allow-Origin"] = opts.origin;
      } else {
        withCorsHeaders["Access-Control-Allow-Origin"] = "*";
      }

      break;
    case corsPolicies.SameOriginIfOriginApplied:
      if (typeof opts.origin === "string") {
        withCorsHeaders["Access-Control-Allow-Origin"] = opts.origin;
      } else {
        withCorsHeaders["Access-Control-Allow-Origin"] = "*";
      }

      break;
    default:
      throw new Error(`Invalid CORS policy: ${opts.policy}`);
  }

  withCorsHeaders["Access-Control-Allow-Credentials"] = "true";
  withCorsHeaders["Access-Control-Allow-Methods"] =
    "GET,DELETE,PATCH,POST,PUT,OPTIONS";
  withCorsHeaders["Access-Control-Allow-Headers"] =
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization";
  if (
    !opts.preflight &&
    opts.method !== "GET" &&
    opts.policy !== corsPolicies.AllowAny
  ) {
    withCorsHeaders["Vary"] = "Origin";
  }
  return withCorsHeaders;
}
