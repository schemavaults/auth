import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse } from "next/server";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getOidcUserinfoAudienceId,
} from "@schemavaults/app-definitions";
import { to_public_verification_jwks, type I_JWT_Keys } from "@schemavaults/jwt";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

/**
 * The OIDC `jwks_uri`: publicly serves the RS256 verification PUBLIC
 * keys of every active keyset for the reserved `oidc-userinfo` audience
 * — the keys relying parties need to verify id_token signatures.
 *
 * Deliberately unauthenticated, in contrast to /api/jwks/[audience]
 * (which serves trusted resource servers the full keyset INCLUDING the
 * private JWE decryption key and therefore requires a signed access
 * assertion). This route uses to_public_verification_jwks, which emits
 * verification public keys only and throws if a key is mismarked.
 */
export async function GET(): Promise<NextResponse> {
  await using dbh = ServerlessDatabase.createDBH();
  const key_manager = new AuthServerJwtKeysManager(dbh.db);

  let keysets: readonly I_JWT_Keys[];
  try {
    await key_manager.createAndSaveKeysetIfNoneExists(
      getOidcUserinfoAudienceId(),
    );
    keysets = await key_manager.listActiveKeysets(getOidcUserinfoAudienceId());
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_oidc_jwks.listActiveKeysets",
      route: "/api/oidc/jwks",
      context: { audience: OIDC_USERINFO_AUDIENCE_ID },
    });
    return NextResponse.json(
      { error: "Failed to load OIDC signing keys" },
      { status: 500 },
    );
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
    await captureServerException(dbh.db, e, {
      op_name: "GET_oidc_jwks.to_public_verification_jwks",
      route: "/api/oidc/jwks",
      context: { audience: OIDC_USERINFO_AUDIENCE_ID },
    });
    return NextResponse.json(
      { error: "Failed to export OIDC signing keys" },
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
