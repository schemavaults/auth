import { buildOpenApiDocument } from "@schemavaults/openapi-operations";
import { operations } from "./operations";
// The API version tracks this package's version (tsconfig: resolveJsonModule).
import packageJson from "../../../package.json";

/** Where the document is served from (src/app/api/openapi.json/route.ts). */
export const OPENAPI_DOCUMENT_PATH = "/api/openapi.json" as const;

/**
 * The OpenAPI 3.1 document describing every operation in the catalogue.
 * Served at GET /api/openapi.json by its own route file and rendered by the
 * /docs pages. Built once at module load: the definitions are static. The
 * responses the runtime produces on its own (400 validation, 401 / 403 on
 * protected operations, 415, 500) are documented too, with the
 * `OperationError` envelope schema.
 */
export const openApiDocument: ReturnType<typeof buildOpenApiDocument> = buildOpenApiDocument({
  info: {
    title: "Example Next.js Resource Server API",
    version: packageJson.version,
    description:
      "Demo API of the SchemaVaults example resource server. Every operation is declared with @schemavaults/openapi-operations; this document and the /docs pages are generated from those declarations.",
  },
  servers: [{ url: "/", description: "This resource server" }],
  tags: [
    { name: "Demo", description: "Unauthenticated operations showing validation and the error envelope" },
    { name: "Account", description: "Operations available to any signed-in SchemaVaults user" },
    { name: "Admin", description: "Operations restricted to platform administrators" },
    { name: "Organizations", description: "Operations gated on organization membership" },
  ],
  operations,
  documentRuntimeResponses: true,
});
