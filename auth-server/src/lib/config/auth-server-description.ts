import "server-only";

/**
 * @description Resolves the site description of this auth server deployment
 * from the SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION environment variable. Rendered
 * as the metadata description in the root layout, so white-label deployments
 * can rebrand it alongside SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME.
 *
 * The canonical env-var resolution lives in @schemavaults/app-definitions so
 * the hardcoded app/API definitions resolve the same value.
 */
export {
  getAuthServerDescription,
  DEFAULT_AUTH_SERVER_DESCRIPTION,
} from "@schemavaults/app-definitions";

export { getAuthServerDescription as default } from "@schemavaults/app-definitions";
