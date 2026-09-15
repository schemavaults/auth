import "server-only";
import { z, publicAccess, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "./context";
import { userCredentialSchemes } from "./auth-schemes";

/**
 * Operations served by this example resource server. Each one is declared
 * once and drives both the runtime (Hono app in ./app.ts) and the OpenAPI
 * document (./openapi-document.ts) that /docs renders.
 */

const timestampField = z
  .number()
  .int()
  .openapi({ description: "Unix epoch milliseconds when the response was produced", example: 1_757_000_000_000 });

const ErrorResponse = z
  .object({
    success: z.literal(false),
    error: z.string().openapi({ example: "unauthorized" }),
    message: z.string(),
  })
  .openapi("ErrorResponse", {
    description: "Error envelope used by every non-2xx response",
  });

const errorResponses = {
  401: { description: "No valid SchemaVaults credential was presented", schema: ErrorResponse },
  403: { description: "The credential is valid but not allowed to perform this operation", schema: ErrorResponse },
} as const;

export const health = defineOperation({
  method: "get",
  path: "/api/health",
  summary: "Liveness probe",
  description: "Unauthenticated health check. Reports the app environment the server runs in.",
  tags: ["Demo"],
  auth: publicAccess("Anyone can call this; it is what load balancers poll."),
  responses: {
    200: {
      description: "The server is up",
      schema: z.object({
        ok: z.literal(true),
        environment: z.enum(["development", "test", "staging", "production"]),
        timestamp: timestampField,
      }),
    },
  },
  handler: (ctx) =>
    ctx.json(200, { ok: true, environment: ctx.context.environment, timestamp: Date.now() }),
});

export const echo = defineOperation({
  method: "post",
  path: "/api/echo",
  summary: "Echo a message",
  description:
    "Demonstrates JSON body validation: the body is parsed with the declared zod schema and a 400 with per-field issues is returned when it does not match.",
  tags: ["Demo"],
  auth: publicAccess(),
  request: {
    body: {
      description: "Message to echo back",
      schema: z
        .object({
          message: z.string().min(1).max(280).openapi({ example: "hello" }),
          repeat: z.number().int().min(1).max(5).default(1).openapi({
            description: "How many times to repeat the message (1-5)",
          }),
        })
        .openapi("EchoRequest"),
    },
  },
  responses: {
    200: {
      description: "The echoed message(s)",
      schema: z.object({ echoes: z.array(z.string()) }).openapi("EchoResponse"),
    },
    400: { description: "The body failed validation", schema: ErrorResponse },
  },
  handler: (ctx) =>
    ctx.json(200, { echoes: Array.from({ length: ctx.body.repeat }, () => ctx.body.message) }),
});

export const ping = defineOperation({
  method: "post",
  path: "/api/ping",
  summary: "Authenticated ping",
  description:
    "Returns a pong for any signed-in user. Accepts the access token either as a Bearer header (what the account page's test button sends) or as the first-party access token cookie.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes }),
  responses: {
    200: {
      description: "Pong",
      schema: z.object({ message: z.literal("Pong!"), timestamp: timestampField }),
    },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { message: "Pong!", timestamp: Date.now() }),
});

export const whoami = defineOperation({
  method: "get",
  path: "/api/whoami",
  summary: "Who am I",
  description:
    "Returns the identity resolved from the presented credential, plus which auth scheme resolved it and the scope granted to the token.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes }),
  responses: {
    200: {
      description: "The caller's identity",
      schema: z
        .object({
          uid: z.string().openapi({ description: "SchemaVaults user id" }),
          email: z.string().nullable(),
          admin: z.boolean(),
          scheme: z.string().openapi({
            description: "Name of the auth scheme that resolved the credential",
            example: "schemavaults-access-token",
          }),
          scope: z.string().nullable().openapi({
            description: "Space separated scope granted to the token, or null when it carries no scope claim",
          }),
        })
        .openapi("Whoami"),
    },
    ...errorResponses,
  },
  handler: (ctx) =>
    ctx.json(200, {
      uid: ctx.auth.user?.uid ?? "",
      email: ctx.auth.user?.email ?? null,
      admin: ctx.auth.isAdmin,
      scheme: ctx.auth.scheme,
      scope: ctx.auth.scope,
    }),
});

export const myEmail = defineOperation({
  method: "get",
  path: "/api/me/email",
  summary: "My email address",
  description:
    "Only tokens whose `scope` claim includes `email` may read the address; tokens without a scope claim are refused with 403 insufficient_scope.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes, requiredScopes: ["email"] }),
  responses: {
    200: { description: "The caller's email", schema: z.object({ email: z.string().nullable() }) },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { email: ctx.auth.user?.email ?? null }),
});

export const adminPing = defineOperation({
  method: "get",
  path: "/api/admin/ping",
  summary: "Administrator ping",
  description: "Only platform administrators (users with the `admin` flag) may call this.",
  tags: ["Admin"],
  auth: requireAuth({ schemes: userCredentialSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "Admin pong",
      schema: z.object({ message: z.literal("Admin pong!"), timestamp: timestampField }),
    },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { message: "Admin pong!", timestamp: Date.now() }),
});

export const organizationGreeting = defineOperation({
  method: "get",
  path: "/api/organizations/{organization_id}/greeting",
  summary: "Organization greeting",
  description:
    "Demonstrates an organization membership requirement: the caller must be a member of the organization named in the path (platform administrators bypass the check). Membership is looked up on the auth server with this API server's JWKS access key.",
  tags: ["Organizations"],
  auth: requireAuth({
    schemes: userCredentialSchemes,
    organization: { parameter: "organization_id", roles: [] },
    notes: "Any membership role is accepted.",
  }),
  request: {
    params: z.object({
      organization_id: z.string().min(1).openapi({ description: "Organization id" }),
    }),
  },
  responses: {
    200: {
      description: "A greeting for the organization member",
      schema: z.object({ message: z.string() }),
    },
    400: { description: "The organization id is missing", schema: ErrorResponse },
    ...errorResponses,
  },
  handler: (ctx) =>
    ctx.json(200, {
      message: `Hello ${ctx.auth.user?.email ?? ctx.auth.user?.uid ?? "member"} of organization ${ctx.params.organization_id}!`,
    }),
});

export const operations = [
  health,
  echo,
  ping,
  whoami,
  myEmail,
  adminPing,
  organizationGreeting,
] as const;
