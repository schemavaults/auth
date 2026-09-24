import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { MY_ORGANIZATIONS_ROUTE, myOrganizationsPreflight, withMyOrganizationsCorsHeaders } from "./cors";
import { listMyOrganizations } from "./operation";

// GET, OPTIONS /api/me/organizations
export const { GET, OPTIONS } = apiRouteHandlers([listMyOrganizations], {
  preflight: (request) => myOrganizationsPreflight(request),
  // Every response, including the runtime's own 401/403, carries the CORS
  // headers so cross-origin client applications can read it.
  configure: (app) => {
    app.use(MY_ORGANIZATIONS_ROUTE, async (c, next) => {
      await next();
      c.res = withMyOrganizationsCorsHeaders(c.req.raw, c.res);
    });
  },
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
