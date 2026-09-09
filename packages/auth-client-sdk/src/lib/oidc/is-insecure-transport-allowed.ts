// is-insecure-transport-allowed.ts
//
// The single place that decides which app environments may talk to an
// auth server over cleartext HTTP.

import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

/**
 * Whether `environment` may talk to an auth server over cleartext HTTP.
 * Mirrors `SchemaVaultsAuthClient.secure`: development and test are the
 * only non-TLS environments; staging and production always require HTTPS.
 */
export function isInsecureTransportAllowed(
  environment: SchemaVaultsAppEnvironment,
): boolean {
  return environment === "development" || environment === "test";
}

export default isInsecureTransportAllowed;
