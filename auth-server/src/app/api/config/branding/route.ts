import "server-only";
import { NextResponse } from "next/server";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";
import type { ServerRuntime } from "next/types";

/**
 * @description Public, unauthenticated endpoint exposing the white-label
 * text/color branding for this auth server deployment (the friendly name and
 * [from, to] theme gradient colors resolved from the
 * SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME and
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1/2 environment variables). Consumed by
 * client components that render outside the root layout's context providers —
 * e.g. the global error page, which replaces the root layout entirely and so
 * cannot read the friendly-name/theme-colors contexts. Intentionally reads only
 * environment variables (no database/Redis) so it stays available when the rest
 * of the server is failing.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: false,
      success: true,
      message: "Successfully loaded server branding config!",
      data: {
        friendly_name: getAuthServerFriendlyName(),
        theme_colors: getAuthServerThemeColors(),
      },
    },
    { status: 200 },
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
