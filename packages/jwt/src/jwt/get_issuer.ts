import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export default function getIssuer(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  const auth_server_url: string = getAuthServerUrl(environment);
  if (typeof auth_server_url !== "string") {
    throw new TypeError(
      "Expected auth server URL to be a string to use as JWT issuer!",
    );
  }
  if (environment === "production" || environment === "staging") {
    if (!auth_server_url.startsWith("https://")) {
      throw new TypeError(
        "Expected auth server URL for JWT issuer to use HTTPS in production or staging environments!",
      );
    }
  }
  return auth_server_url;
}
