import "server-only";

/**
 * @description Resolves the human-friendly name of this auth server deployment
 * from the SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME environment variable. This is
 * the text rendered by every <Wordmark /> in the application, so white-label
 * deployments can rebrand the layout header and other usages (e.g. "AcmeCorp Auth").
 *
 * The canonical env-var resolution lives in @schemavaults/app-definitions so
 * the hardcoded app/API definitions resolve the same value.
 */
export { getAuthServerFriendlyName } from "@schemavaults/app-definitions";

export { getAuthServerFriendlyName as default } from "@schemavaults/app-definitions";
