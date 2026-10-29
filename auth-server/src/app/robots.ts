import "server-only";
import type { MetadataRoute, ServerRuntime } from "next";
import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { buildAuthServerRobots } from "@/lib/seo/crawler-policy";

// GET /robots.txt — production deployments let crawlers index the public
// pages and point them at /sitemap.xml; every other environment asks them
// to stay out.
export default function robots(): MetadataRoute.Robots {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  return buildAuthServerRobots({
    auth_server_url: getAuthServerUrl(environment),
    environment,
  });
}

export const runtime: ServerRuntime = "nodejs";
// Resolve the environment and white-label URL per request instead of
// freezing them at build time.
export const dynamic = "force-dynamic";
