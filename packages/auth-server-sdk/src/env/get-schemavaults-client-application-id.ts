import { type ApiServerId, appIdSchema } from "@schemavaults/app-definitions";
export { type ApiServerId } from "@schemavaults/app-definitions";

/**
 * @description Loads the client app ID. This is usually defined on the client-side, but this is useful in the auth-server-sdk
 * for cases where one app is both the client & server (e.g. Next.js)
 * @returns Parsed value of process.env.SCHEMAVAULTS_CLIENT_APP_ID
 */
function getSchemavaultsClientApplicationId(): ApiServerId {
  const appIdEnvVar: string | undefined =
    process.env.SCHEMAVAULTS_CLIENT_APP_ID;
  if (appIdEnvVar && typeof appIdEnvVar === "string") {
    if (!appIdSchema.safeParse(appIdEnvVar).success) {
      throw new TypeError(
        "Invalid API server ID to use from 'SCHEMAVAULTS_CLIENT_APP_ID' environment variable!",
      );
    }
    return appIdEnvVar;
  } else {
    throw new TypeError(
      "Environment variable 'SCHEMAVAULTS_CLIENT_APP_ID' is not set!",
    );
  }
}

export { getSchemavaultsClientApplicationId };
export default getSchemavaultsClientApplicationId;
