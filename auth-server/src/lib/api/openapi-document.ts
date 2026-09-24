import {
  getAuthServerFriendlyName,
  getAuthServerOwnerOrganizationId,
  getAuthServerOwnerOrganizationName,
} from "@schemavaults/app-definitions";
import { buildOpenApiDocument, type OpenAPIObject } from "@schemavaults/openapi-operations";
import { operations } from "./operations";
import { API_TAG_DESCRIPTIONS } from "./tags";
import { describeAuthServerApi } from "./api-document-description";
import {
  accessTokenBearerScheme,
  accessTokenCookieScheme,
  jwksAccessAssertionScheme,
  sessionCookieScheme,
} from "./auth-schemes";
// The API version tracks the auth server's version (tsconfig: resolveJsonModule).
import packageJson from "../../../package.json";

/** Where the document is served from (src/app/api/openapi.json/route.ts). */
export const OPENAPI_DOCUMENT_PATH = "/api/openapi.json" as const;

/** Where the generated docs pages live (src/app/docs). */
export const API_DOCS_PATH = "/docs" as const;

let cached: OpenAPIObject | null = null;

/**
 * The OpenAPI 3.1 document describing every operation in the catalogue.
 * Served at GET /api/openapi.json by its own route file and rendered by the
 * /docs pages. Built on first use (the definitions are static; only the
 * white-label friendly name and owner organization come from the
 * environment) and memoised.
 */
export function getOpenApiDocument(): OpenAPIObject {
  cached ??= buildOpenApiDocument({
    info: {
      title: `${getAuthServerFriendlyName()} API`,
      version: packageJson.version,
      description: describeAuthServerApi({
        friendlyName: getAuthServerFriendlyName(),
        ownerOrganizationId: getAuthServerOwnerOrganizationId(),
        ownerOrganizationName: getAuthServerOwnerOrganizationName(),
      }),
    },
    servers: [{ url: "/", description: "This auth server" }],
    tags: API_TAG_DESCRIPTIONS,
    additionalAuthSchemes: [
      sessionCookieScheme,
      accessTokenCookieScheme,
      accessTokenBearerScheme,
      jwksAccessAssertionScheme,
    ],
    operations,
  });
  return cached;
}

/** Copy of the document with `servers` pointing at the given origin. */
export function withServerUrl(document: OpenAPIObject, url: string): OpenAPIObject {
  const description = document.servers?.[0]?.description ?? "This auth server";
  return { ...document, servers: [{ url, description }] };
}
