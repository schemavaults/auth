import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";

export default function loadApiServerId(
  env: object = process.env,
): ApiServerId {
  if (
    typeof env === "object" &&
    "SCHEMAVAULTS_API_SERVER_ID" in env &&
    typeof env["SCHEMAVAULTS_API_SERVER_ID"] === "string" &&
    env["SCHEMAVAULTS_API_SERVER_ID"].length > 0
  ) {
    const parsed = apiServerIdSchema.safeParse(
      env["SCHEMAVAULTS_API_SERVER_ID"],
    );
    if (!parsed.success) {
      throw new TypeError(
        "Invalid value set for 'SCHEMAVAULTS_API_SERVER_ID' environment variable!",
      );
    }
    return parsed.data;
  } else {
    throw new TypeError(
      "Environment variable 'SCHEMAVAULTS_API_SERVER_ID' is not set!",
    );
  }
}
