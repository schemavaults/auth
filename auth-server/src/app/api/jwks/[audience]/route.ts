import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { AuthServerJwtKeysManager } from "@/lib/AuthServerJwtKeysManager";
import { ServerlessDatabase } from "@/lib/auth-db";
import { type ApiServerId, apiServerIdSchema } from "@schemavaults/app-definitions";

function isValidApiServerId(val: unknown): val is ApiServerId {
  return typeof val === "string" && apiServerIdSchema.safeParse(val).success
}

async function isLoadJwksRequestAuthenticated(req: Request): Promise<boolean> {
  const headers: Headers = req.headers;

  const authorization = headers.get("Authorization");
  if (!authorization) return false;

  const [type, token] = authorization.split(" ");
  if (type !== "Bearer") return false;

  const key_manager = new AuthServerJwtKeysManager(ServerlessDatabase.createDBH().db);
  const payload = await key_manager.verifyJwt(token);
  if (!payload) return false;

  return payload.aud === "auth-server-jwks";
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/jwks/[audience]'>) {
  const { audience } = await ctx.params;

  if (!audience || !isValidApiServerId(audience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }

  if (!await isLoadJwksRequestAuthenticated(request)) {
    console.warn(`Received unauthorized request to load jwks audience "${audience}"`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await using dbh = ServerlessDatabase.createDBH();

  const key_manager = new AuthServerJwtKeysManager(dbh.db);

  const jwks = await key_manager.loadJwks(audience);

  return NextResponse.json(jwks, {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
  });
}
