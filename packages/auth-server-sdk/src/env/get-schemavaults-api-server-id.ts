import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
export { type ApiServerId } from "@schemavaults/app-definitions";

/**
 * @returns Parsed value of process.env.SCHEMAVAULTS_API_SERVER_ID
 */
function getSchemavaultsApiServerId(): ApiServerId {
  const apiServerIdEnvVar: string | undefined =
    process.env.SCHEMAVAULTS_API_SERVER_ID;
  if (apiServerIdEnvVar && typeof apiServerIdEnvVar === "string") {
    if (!apiServerIdSchema.safeParse(apiServerIdEnvVar).success) {
      throw new TypeError(
        "Invalid API server ID to use from 'SCHEMAVAULTS_API_SERVER_ID' environment variable!",
      );
    }
    return apiServerIdEnvVar;
  } else {
    throw new TypeError(
      "Environment variable 'SCHEMAVAULTS_API_SERVER_ID' is not set!",
    );
  }
}

export { getSchemavaultsApiServerId };
export default getSchemavaultsApiServerId;
