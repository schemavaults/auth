import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

/**
 * The environment variable holding this resource server's resource
 * identifier: the URL clients name it by (an RFC 8707 `resource`), the
 * `resource` of its RFC 9728 protected resource metadata, and therefore
 * the `aud` of the access tokens such clients obtain for it.
 */
export const RESOURCE_URL_ENV_VAR_NAME = "SCHEMAVAULTS_RESOURCE_URL" as const;

/**
 * @description Validates a resource identifier (RFC 9728 §1.2 / RFC 8707
 * §2): an absolute http(s) URL without query or fragment. `https` is
 * required in production and staging. The value is returned verbatim
 * (only surrounding whitespace is trimmed), since it becomes a token
 * audience that is compared byte for byte.
 *
 * @throws TypeError when the value is not a usable resource identifier.
 */
export function parseResourceUrl(
  value: string,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  const trimmed: string = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TypeError(`Resource URL is not an absolute URL: '${value}'`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError(`Resource URL must be an http(s) URL: '${value}'`);
  }
  if (url.protocol !== "https:" && (environment === "production" || environment === "staging")) {
    throw new TypeError(`Resource URL must use https in ${environment}: '${value}'`);
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    throw new TypeError(`Resource URL must not include a query or fragment: '${value}'`);
  }
  if (url.username || url.password) {
    throw new TypeError(`Resource URL must not include credentials: '${value}'`);
  }
  return trimmed;
}

/**
 * @returns The resource URL configured in `SCHEMAVAULTS_RESOURCE_URL`, or
 * null when it is unset or empty.
 * @throws TypeError when it is set to something that is not a usable
 * resource identifier (see {@link parseResourceUrl}).
 */
export function getSchemaVaultsResourceUrl(
  environment?: SchemaVaultsAppEnvironment,
): string | null {
  const raw: string | undefined = process.env[RESOURCE_URL_ENV_VAR_NAME];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  try {
    return parseResourceUrl(raw, environment);
  } catch (e: unknown) {
    throw new TypeError(
      `Invalid '${RESOURCE_URL_ENV_VAR_NAME}' environment variable: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

/**
 * @description The token audiences a resource URL stands for: the URL
 * itself and its twin with (or without) one trailing slash. Clients that
 * normalize the URL they read from the protected resource metadata
 * (`new URL("https://api.example.com").href` is `https://api.example.com/`)
 * request their tokens with the other spelling; the auth server resolves
 * both to the same API server, and both are this server's own audience.
 */
export function resourceUrlAudiences(resource_url: string): readonly string[] {
  const without: string = resource_url.endsWith("/")
    ? resource_url.slice(0, -1)
    : resource_url;
  return [resource_url, resource_url === without ? `${without}/` : without];
}

export default getSchemaVaultsResourceUrl;
