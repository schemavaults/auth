import "server-only";

/**
 * Optional fixed public URL of this deployment (scheme + host [+ port]).
 * When set it wins over the request headers below; useful behind proxies
 * that do not forward the original host, or to pin a canonical URL.
 */
export const PUBLIC_URL_ENV_VAR = "SCHEMAVAULTS_EXAMPLE_RESOURCE_SERVER_URL" as const;

const DEFAULT_ORIGIN = "http://localhost:3007" as const;

function firstValue(value: string | null | undefined): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

function originFromEnv(): string | undefined {
  const raw = process.env[PUBLIC_URL_ENV_VAR];
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    console.warn(`[public-origin] Ignoring invalid ${PUBLIC_URL_ENV_VAR}: ${raw}`);
    return undefined;
  }
}

/**
 * Resolves the public origin of this server for the current request:
 * the env override, else `X-Forwarded-Proto` + `X-Forwarded-Host` (set by
 * Vercel / reverse proxies), else the plain `Host` header, else the
 * request URL's origin, else the local dev default. The value is only
 * used to render documentation (server list, curl examples) back to the
 * same client, so trusting forwarded headers here is harmless.
 */
export function resolvePublicOrigin(
  getHeader: (name: string) => string | null | undefined,
  requestUrl?: string,
): string {
  const fromEnv = originFromEnv();
  if (fromEnv) return fromEnv;

  let fallbackProtocol = "http";
  let fallbackOrigin: string | undefined;
  if (requestUrl) {
    try {
      const parsed = new URL(requestUrl);
      fallbackProtocol = parsed.protocol.replace(/:$/, "");
      fallbackOrigin = parsed.origin;
    } catch {
      // ignore unparsable request URLs
    }
  }

  const host = firstValue(getHeader("x-forwarded-host")) ?? firstValue(getHeader("host"));
  const protocol = firstValue(getHeader("x-forwarded-proto")) ?? fallbackProtocol;
  if (host) return `${protocol}://${host}`;
  return fallbackOrigin ?? DEFAULT_ORIGIN;
}

/** Copy of an OpenAPI document with `servers` pointing at the given origin. */
export function withServerUrl<T extends { servers?: readonly { url: string; description?: string }[] }>(
  document: T,
  url: string,
): T {
  const description = document.servers?.[0]?.description ?? "This resource server";
  return { ...document, servers: [{ url, description }] };
}
