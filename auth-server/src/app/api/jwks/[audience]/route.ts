import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { ServerlessDatabase } from "@/lib/auth-db";
import { type ApiServerId, apiServerIdSchema } from "@schemavaults/app-definitions";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { jwtVerify, importSPKI } from "@schemavaults/jwt";

function isValidApiServerId(val: unknown): val is ApiServerId {
  return typeof val === "string" && apiServerIdSchema.safeParse(val).success
}

async function verifyJwksAccessAssertion(
  assertion: string,
  audience: string,
  db: ReturnType<typeof ServerlessDatabase.createDBH>["db"]
): Promise<boolean> {
  const accessKeysRegistry = new JwksAccessKeysRegistry(db);
  const activeKey = await accessKeysRegistry.getActiveKeyForAudience(audience);

  if (!activeKey) {
    console.warn(`No active JWKS access key found for audience "${audience}"`);
    return false;
  }

  try {
    const publicKey = await importSPKI(activeKey.public_key, "RS256");
    const { payload } = await jwtVerify(assertion, publicKey, {
      algorithms: ["RS256"],
    });

    // Verify the assertion is for this specific audience
    if (payload.sub !== audience) {
      console.warn(`Assertion subject "${payload.sub}" does not match audience "${audience}"`);
      return false;
    }

    return true;
  } catch (e: unknown) {
    console.error("Failed to verify JWKS access assertion:", e);
    return false;
  }
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ audience: string }> }
) {
  const { audience } = await props.params;

  if (!audience || !isValidApiServerId(audience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
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
  const isAuthenticated = await verifyJwksAccessAssertion(assertion, audience, dbh.db);
  if (!isAuthenticated) {
    console.warn(`Received unauthorized request to load jwks audience "${audience}"`);
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const key_manager = new AuthServerJwtKeysManager(dbh.db);

  const jwks = await key_manager.loadJwks(audience);

  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0 || !jwks.keys.every(k => typeof k === 'object')) {
    return NextResponse.json({
      success: false,
      error: "Expected 'keys' field of loaded JWKS to be a non-empty array."
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
