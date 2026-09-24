import {
  DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
} from "@schemavaults/app-definitions";

/** Who runs this deployment, as configured by the white-label env vars. */
export interface AuthServerDeploymentIdentity {
  /** SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME */
  readonly friendlyName: string;
  /** SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION */
  readonly ownerOrganizationId: string;
  /** SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION_NAME */
  readonly ownerOrganizationName: string;
}

/**
 * A deployment is white-labelled when it is rebranded or owned by an
 * organization other than SchemaVaults: it then runs @schemavaults/auth-server
 * but is not SchemaVaults' own instance.
 */
export function isWhiteLabelDeployment(identity: AuthServerDeploymentIdentity): boolean {
  return (
    identity.friendlyName !== DEFAULT_AUTH_SERVER_FRIENDLY_NAME ||
    identity.ownerOrganizationId !== DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID ||
    identity.ownerOrganizationName !== DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME
  );
}

const API_SURFACE =
  "authentication and OpenID Connect endpoints, account and organization management, client application and API server registrations, and platform administration";

const GENERATED_FROM =
  "Every operation is declared with @schemavaults/openapi-operations; this document and the /docs pages are generated from those declarations.";

/**
 * `info.description` of the auth server's OpenAPI document (rendered at the
 * top of /docs). Paragraphs are separated by blank lines. On a white-label
 * deployment it says that the server is an instance of
 * @schemavaults/auth-server run by someone other than SchemaVaults, so its
 * accounts and registrations are not SchemaVaults'.
 */
export function describeAuthServerApi(identity: AuthServerDeploymentIdentity): string {
  if (!isWhiteLabelDeployment(identity)) {
    return [
      `HTTP API of ${identity.friendlyName}, SchemaVaults' own instance of @schemavaults/auth-server: ${API_SURFACE}.`,
      GENERATED_FROM,
    ].join("\n\n");
  }
  // Without a configured owner organization name the operator is unknown;
  // never name SchemaVaults as the operator of a rebranded deployment.
  const operator =
    identity.ownerOrganizationName !== DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME
      ? `operated by ${identity.ownerOrganizationName}`
      : "operated independently";
  return [
    `HTTP API of ${identity.friendlyName}: ${API_SURFACE}.`,
    `${identity.friendlyName} is an instance of @schemavaults/auth-server ${operator}. It is not SchemaVaults' own instance (${DEFAULT_AUTH_SERVER_FRIENDLY_NAME}): accounts, organizations, client applications, API servers and tokens on this server are separate from SchemaVaults'.`,
    GENERATED_FROM,
  ].join("\n\n");
}
