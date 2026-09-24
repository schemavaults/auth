import { NextResponse } from "next/server";
import { OIDC_USERINFO_AUDIENCE_ID, getOidcUserinfoAudienceId } from "@schemavaults/app-definitions";
import { to_public_verification_jwks, type I_JWT_Keys } from "@schemavaults/jwt";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { API_TAGS } from "@/lib/api/tags";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/oidc/jwks";

export const OidcJsonWebKey = z
  .object({
    kty: z.string().openapi({ description: "Key type", example: "RSA" }),
    kid: z.string().openapi({ description: "Key id; matches the `kid` header of id_tokens signed with it." }),
    alg: z.string().openapi({ example: "RS256" }),
    use: z.string().openapi({ example: "sig" }),
    n: z.string().optional().openapi({ description: "RSA modulus (base64url)" }),
    e: z.string().optional().openapi({ description: "RSA public exponent (base64url)", example: "AQAB" }),
  })
  .loose()
  .openapi("OidcJsonWebKey", { description: "A public verification key (RFC 7517); never carries private members." });

export const OidcJsonWebKeySet = z
  .object({ keys: z.array(OidcJsonWebKey).readonly() })
  .openapi("OidcJsonWebKeySet");

export const getOidcJwks = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "id_token verification keys (JWKS)",
  description:
    "The OIDC `jwks_uri`: the RS256 verification PUBLIC keys of every active keyset for the reserved `oidc-userinfo` audience, which relying parties need to verify id_token signatures. Creates the first keyset on demand. " +
    "Unlike `GET /api/jwks/{audience}` (which serves trusted resource servers the full keyset and requires a JWKS access assertion) this document is public and contains verification keys only. Cached briefly (`Cache-Control: public, max-age=300`) so rotated-in keysets propagate quickly; served with `Access-Control-Allow-Origin: *`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess("Unauthenticated by design: public verification keys only."),
  responses: {
    200: { description: "The JSON Web Key Set", schema: OidcJsonWebKeySet },
    500: {
      description: "The signing keys could not be loaded or exported",
      schema: z.object({ error: z.string() }).openapi("OidcJwksErrorResponse"),
    },
  },
  handler: async (ctx) => {
    const { db } = ctx.context;
    const key_manager = new AuthServerJwtKeysManager(db);

    let keysets: readonly I_JWT_Keys[];
    try {
      await key_manager.createAndSaveKeysetIfNoneExists(getOidcUserinfoAudienceId());
      keysets = await key_manager.listActiveKeysets(getOidcUserinfoAudienceId());
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_oidc_jwks.listActiveKeysets",
        route: ROUTE,
        context: { audience: OIDC_USERINFO_AUDIENCE_ID },
      });
      return NextResponse.json({ error: "Failed to load OIDC signing keys" }, { status: 500 });
    }

    try {
      const jwks = await to_public_verification_jwks(keysets);
      return NextResponse.json(jwks, {
        headers: {
          "Content-Type": "application/json",
          // Short-lived cache so rotated-in keysets propagate quickly.
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_oidc_jwks.to_public_verification_jwks",
        route: ROUTE,
        context: { audience: OIDC_USERINFO_AUDIENCE_ID },
      });
      return NextResponse.json({ error: "Failed to export OIDC signing keys" }, { status: 500 });
    }
  },
});
