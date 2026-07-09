import maybeStripQuotes from "./maybe-strip-quotes";
import { type AppId, appIdSchema } from "./app-id";

export const DEFAULT_AUTH_SERVER_APP_ID =
  "schemavaults-auth" as const satisfies AppId;

/**
 * @description Resolves this auth server deployment's own app ID from the
 * SCHEMAVAULTS_AUTH_SERVER_APP_ID environment variable, so white-label
 * deployments can rebrand it (e.g. "acme-corp-auth"). The value doubles as
 * the api_server_id of the auth server's own hardcoded API definition, the
 * JWT audience translation key, and the suffix of the auth refresh-token
 * cookie names. Server-side only: client components must receive the resolved
 * value via props/context, since browser bundles cannot read this variable
 * and would silently fall back to the default.
 *
 * @throws if the environment variable is set but is not a valid app ID
 */
export function getAuthServerAppId(): AppId {
  const app_id: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID,
  );
  if (typeof app_id !== "string" || app_id.length === 0) {
    return DEFAULT_AUTH_SERVER_APP_ID;
  }

  const parsed = appIdSchema.safeParse(app_id);
  if (!parsed.success) {
    throw new Error(
      "Failed to load 'SCHEMAVAULTS_AUTH_SERVER_APP_ID' from environment variables!",
      {
        cause: parsed.error,
      },
    );
  }
  return parsed.data;
}

export default getAuthServerAppId;
