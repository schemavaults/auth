import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { myNotes } from "./operation";

// GET /api/me/notes
// This route file serves only the operation declared beside it.
// `apiRouteHandlers` refuses to mount an operation missing from the
// catalogue in src/lib/api/operations.ts, so nothing can be served here
// without also appearing in GET /api/openapi.json.
export const { GET } = apiRouteHandlers(myNotes);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
