import "server-only";
import maybeStripQuotes from "@/lib/maybeStripQuotes";

export const DEFAULT_AUTH_SERVER_DESCRIPTION =
  "Authentication and authorization for SchemaVaults";

/**
 * @description Resolves the site description of this auth server deployment
 * from the SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION environment variable. Rendered
 * as the metadata description in the root layout, so white-label deployments
 * can rebrand it alongside SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME.
 */
export function getAuthServerDescription(): string {
  const description: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION,
  );
  if (typeof description === "string" && description.length > 0) {
    return description;
  }
  return DEFAULT_AUTH_SERVER_DESCRIPTION;
}

export default getAuthServerDescription;
