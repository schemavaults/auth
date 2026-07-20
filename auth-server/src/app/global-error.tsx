"use client";

import { useEffect, useState, type ReactElement } from "react";
import { LoadingPage } from "@schemavaults/ui";
import { ErrorPage } from "@/components/ErrorPage";
import { DEFAULT_AUTH_SERVER_FRIENDLY_NAME } from "@/lib/config/default-auth-server-friendly-name";
import {
  DEFAULT_AUTH_SERVER_THEME_COLORS,
  type AuthServerThemeColors,
} from "@/lib/config/default-auth-server-theme-colors";

interface AuthServerBrandingConfig {
  friendly_name: string;
  theme_colors: AuthServerThemeColors;
}

const DEFAULT_BRANDING_CONFIG: AuthServerBrandingConfig = {
  friendly_name: DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
  theme_colors: DEFAULT_AUTH_SERVER_THEME_COLORS,
};

/**
 * @description Give up on loading the white-label branding config after this
 * long and render the default-branded error page — the branding must never
 * keep the actual error hidden behind the loading spinner indefinitely.
 */
const BRANDING_CONFIG_FETCH_TIMEOUT_MS = 5_000;

function isAuthServerBrandingConfig(
  value: unknown,
): value is AuthServerBrandingConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const friendly_name: unknown = (value as Record<string, unknown>)[
    "friendly_name"
  ];
  const theme_colors: unknown = (value as Record<string, unknown>)[
    "theme_colors"
  ];
  return (
    typeof friendly_name === "string" &&
    friendly_name.length > 0 &&
    Array.isArray(theme_colors) &&
    theme_colors.length === 2 &&
    theme_colors.every(
      (color: unknown): boolean =>
        typeof color === "string" && color.length > 0,
    )
  );
}

/**
 * @description The global error page replaces the root layout entirely, so the
 * friendly-name/theme-colors context providers mounted there are unavailable
 * and the white-label branding must be loaded client-side at error time from
 * the env-only GET /api/config/branding endpoint. A loading spinner is shown
 * until that load settles (so the default branding never flashes before the
 * custom branding resolves); the default "SchemaVaults" branding is rendered
 * only when the load fails or times out — which is likely when the server is
 * broken enough to reach this page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  // null = branding config still loading
  const [branding, setBranding] = useState<AuthServerBrandingConfig | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadBrandingConfig(): Promise<void> {
      try {
        const response = await fetch("/api/config/branding", {
          signal:
            typeof AbortSignal.timeout === "function"
              ? AbortSignal.timeout(BRANDING_CONFIG_FETCH_TIMEOUT_MS)
              : undefined,
        });
        if (!response.ok) {
          throw new Error(
            `Branding config request failed with HTTP status ${response.status}!`,
          );
        }
        const body: unknown = await response.json();
        const data: unknown =
          typeof body === "object" && body !== null && "data" in body
            ? (body as { data: unknown }).data
            : undefined;
        if (!isAuthServerBrandingConfig(data)) {
          throw new Error("Unexpected branding config response shape!");
        }
        if (!cancelled) {
          setBranding(data);
        }
      } catch (e: unknown) {
        console.error(
          "Failed to load white-label branding config; falling back to default branding: ",
          e,
        );
        if (!cancelled) {
          setBranding(DEFAULT_BRANDING_CONFIG);
        }
      }
    }

    void loadBrandingConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <html>
      <body>
        {branding === null ? (
          <LoadingPage />
        ) : (
          <ErrorPage
            message="Something went wrong!"
            error={error}
            reset={reset}
            wordmarkProps={{
              wordmarkText: branding.friendly_name,
              gradientColors: branding.theme_colors,
            }}
          />
        )}
      </body>
    </html>
  );
}
