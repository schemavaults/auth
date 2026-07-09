import maybeStripQuotes from "./maybe-strip-quotes";

export const DEFAULT_AUTH_SERVER_FRIENDLY_NAME = "SchemaVaults Auth";

/**
 * @description Resolves the human-friendly name of this auth server deployment
 * from the SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME environment variable. This is
 * the text rendered by every <Wordmark /> in the application, so white-label
 * deployments can rebrand the layout header and other usages (e.g. "AcmeCorp Auth").
 */
export function getAuthServerFriendlyName(): string {
  const friendly_name: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME,
  );
  if (typeof friendly_name === "string" && friendly_name.length > 0) {
    return friendly_name;
  }
  return DEFAULT_AUTH_SERVER_FRIENDLY_NAME;
}

export default getAuthServerFriendlyName;
