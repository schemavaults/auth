import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions/get-app-environment";
import {
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";

export default function getSchemaVaultsAuthServerUri(): string {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (
    process.env.SCHEMAVAULTS_AUTH_SERVER_URI &&
    typeof process.env.SCHEMAVAULTS_AUTH_SERVER_URI === "string" &&
    process.env.SCHEMAVAULTS_AUTH_SERVER_URI.length > 0
  ) {
    if (
      !process.env.SCHEMAVAULTS_AUTH_SERVER_URI.startsWith("http://") &&
      !process.env.SCHEMAVAULTS_AUTH_SERVER_URI.startsWith("https://")
    ) {
      throw new TypeError("Expected auth server URI to to use HTTP or HTTPS!");
    }

    if (
      environment !== "development" &&
      environment !== "test" &&
      !process.env.SCHEMAVAULTS_AUTH_SERVER_URI.startsWith("https://")
    ) {
      throw new Error(
        "Expected auth server URI to use https in production/staging environments!",
      );
    }
    return process.env.SCHEMAVAULTS_AUTH_SERVER_URI;
  }

  return getHardcodedClientWebAppDomain(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    environment,
  );
}
