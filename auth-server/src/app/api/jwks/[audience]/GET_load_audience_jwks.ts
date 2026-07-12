import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { ServerlessDatabase } from "@/lib/auth-db";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  isValidApiServerId,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import verifyJwksAccessAssertion from "./verifyJwksAccessAssertion";
import captureServerException from "@/lib/captureServerException";

export async function GET(
  request: NextRequest,
  props: RouteContext<"/api/jwks/[audience]">
) {
  const { audience } = await props.params;

  if (!audience || !isValidApiServerId(audience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }

  if (audience === getAuthServerAppId()) {
    return NextResponse.json({ error: "The auth server does not export its JWKS." }, { status: 400 });
  }

  // The reserved OIDC audience is likewise never exportable here: this
  // endpoint ships the PRIVATE JWE decryption key to trusted resource
  // servers, and the `oidc-userinfo` decryption key guards the tokens
  // redeemed at /api/oidc/userinfo. The public verification keys are
  // served (unauthenticated) at /api/oidc/jwks instead.
  if (audience === OIDC_USERINFO_AUDIENCE_ID) {
    return NextResponse.json({ error: "The auth server does not export the OIDC userinfo JWKS." }, { status: 400 });
  }

  await using dbh = ServerlessDatabase.createDBH();

  // Extract assertion from Authorization header
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    console.warn(`Received request to load jwks audience "${audience}" without Authorization header`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [type, assertion] = authorization.split(" ");
  if (type !== "Bearer" || !assertion) {
    console.warn(`Invalid Authorization header format for jwks audience "${audience}"`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the signed assertion using audience-specific public key
  const isAuthenticated: boolean = await verifyJwksAccessAssertion(assertion, audience, dbh.db);
  if (!isAuthenticated) {
    console.warn(`Received unauthorized request to load jwks audience "${audience}"`);
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }
  console.assert(isAuthenticated, "Expected user to be authenticated if this point was reached, they're not!");

  const key_manager = new AuthServerJwtKeysManager(dbh.db);

  try {
    await key_manager.createAndSaveKeysetIfNoneExists(audience);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_load_audience_jwks.createAndSaveKeysetIfNoneExists",
      route: "/api/jwks/[audience]",
      context: { audience },
    });
    return NextResponse.json({ error: "Failed to ensure that there are active keys in the JWKS for audience!", success: false }, { status: 500 });
  }

  const jwks = await key_manager.loadJwks(audience);

  if (!Array.isArray(jwks.keys)) {
    return NextResponse.json({
      success: false,
      error: "Expected 'keys' field of loaded JWKS to be an array."
    }, {
      status: 500
    });
  }

  if (jwks.keys.length > 0 && !jwks.keys.every(k => typeof k === 'object')) {
    return NextResponse.json({
      success: false,
      error: "Expected 'keys' field of loaded JWKS to be an array of objects."
    }, {
      status: 500
    });
  }

  return NextResponse.json(jwks, {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
  });
}

export default GET;
