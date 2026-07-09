import "server-only";

/**
 * @description Server-side import surface for the organization that owns this
 * auth server deployment. The canonical env-var resolution
 * (SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION / _NAME) lives in
 * @schemavaults/app-definitions so the hardcoded app/API definitions and
 * @schemavaults/auth-common's getHardcodedOrgs() resolve the same value.
 */
export {
  getAuthServerOwnerOrganizationId,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
  getAuthServerOwnerOrganizationName,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
} from "@schemavaults/app-definitions";

export { getAuthServerOwnerOrganizationId as default } from "@schemavaults/app-definitions";
