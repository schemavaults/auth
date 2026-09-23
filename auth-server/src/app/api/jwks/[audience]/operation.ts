import {
  apiServerIdSchema,
  OIDC_USERINFO_AUDIENCE_ID,
  type ApiServerId,
} from "@schemavaults/app-definitions";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { jwksAccessAssertionScheme } from "@/lib/api/auth-schemes";
import {
  JsonWebKeySet,
  jwksAssertionErrorResponses,
  ResourceServerErrorResponse,
} from "@/lib/api/domain-schemas/resource-servers";
import { API_TAGS } from "@/lib/api/tags";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import captureServerException from "@/lib/captureServerException";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

const ROUTE = "/api/jwks/{audience}";

export const getAudienceJwks = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Load an API server's JWKS",
  description:
    "Returns the JSON Web Key Set the auth server signs and encrypts tokens for the given API server (`audience`) with, creating the keyset on first use. The set includes the private JWE decryption key, so only that API server may fetch it: it presents a single-use JWKS access assertion signed with its JWKS access private key (see `POST /api/apis/{api_server_id}/jwks-access-key`); resource servers built on `@schemavaults/auth-server-sdk` do this through `RemoteJwtKeyManager`. The auth server's own keys and the reserved `oidc-userinfo` keys are never exported here; the public verification keys are served unauthenticated at `GET /api/oidc/jwks`.",
  tags: [API_TAGS.resourceServers],
  auth: requireAuth({
    schemes: [jwksAccessAssertionScheme],
    notes:
      "The assertion's `iss` / `sub` must equal the `audience` path parameter, so an API server can only load its own JWKS. Every assertion is accepted once.",
  }),
  request: {
    params: z.object({
      audience: withOpenApi(apiServerIdSchema, {
        description: "API server id whose JWKS to load; must equal the assertion's issuer",
        example: "my-resource-api",
      }),
    }),
  },
  responses: {
    200: {
      description: "The JWKS of the audience, including the private JWE decryption key",
      schema: JsonWebKeySet,
    },
    ...jwksAssertionErrorResponses,
    500: { description: "The keyset could not be created or loaded", schema: ResourceServerErrorResponse },
  },
  handler: async (ctx) => {
    const { db } = ctx.context;
    // The resolver verified the assertion for this very id (ctx.auth.clientId).
    const audience: ApiServerId = ctx.params.audience;

    // The resolver already refuses the auth server's own id; kept as a
    // second line of defence, this endpoint ships private key material.
    if (audience === getAuthServerAppId()) {
      return ctx.json(400, { success: false, error: "The auth server does not export its JWKS." });
    }

    // The reserved OIDC audience is likewise never exportable here: this
    // endpoint ships the PRIVATE JWE decryption key to trusted resource
    // servers, and the `oidc-userinfo` decryption key guards the tokens
    // redeemed at /api/oidc/userinfo. The public verification keys are
    // served (unauthenticated) at /api/oidc/jwks instead.
    if (audience === OIDC_USERINFO_AUDIENCE_ID) {
      return ctx.json(400, {
        success: false,
        error: "The auth server does not export the OIDC userinfo JWKS.",
      });
    }

    const key_manager = new AuthServerJwtKeysManager(db);

    try {
      await key_manager.createAndSaveKeysetIfNoneExists(audience);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_load_audience_jwks.createAndSaveKeysetIfNoneExists",
        route: "/api/jwks/[audience]",
        context: { audience },
      });
      return ctx.json(500, {
        success: false,
        error: "Failed to ensure that there are active keys in the JWKS for audience!",
      });
    }

    const jwks = await key_manager.loadJwks(audience);

    if (!Array.isArray(jwks.keys)) {
      return ctx.json(500, {
        success: false,
        error: "Expected 'keys' field of loaded JWKS to be an array.",
      });
    }

    if (jwks.keys.length > 0 && !jwks.keys.every((k) => typeof k === "object")) {
      return ctx.json(500, {
        success: false,
        error: "Expected 'keys' field of loaded JWKS to be an array of objects.",
      });
    }

    return ctx.json(200, jwks, { headers: { "Content-Type": "application/json" } });
  },
});
