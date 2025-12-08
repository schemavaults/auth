import type { JWKS } from "@schemavaults/jwt";

export interface ILoadRemoteJwksOpts {
  auth_server_uri: string;
  jwks_endpoint?: string;
}

const DEFAULT_REMOTE_JWKS_ENDPOINT = "/.well-known/jwks.json" as const satisfies string;

export async function loadRemoteJwks({ auth_server_uri, ...opts }: ILoadRemoteJwksOpts): Promise<JWKS> {
  const jwks_endpoint = typeof opts.jwks_endpoint === 'string' ? opts.jwks_endpoint : DEFAULT_REMOTE_JWKS_ENDPOINT
  const response: Response = await fetch(
    `${auth_server_uri}${jwks_endpoint}`,
    { method: "GET" }
  )
  if (!response.ok || response.status !== 200) {
    throw new Error("Failed to load jwks.json from auth server!")
  }
  const body: unknown = await response.json();
  if (typeof body !== 'object' || !body) {
    throw new TypeError("Expected result of loading jwks.json to be an object!")
  }
  if (!("keys" in body) || !Array.isArray(body['keys'])) {
    throw new Error("Expected response body of jwks.json to have a 'keys' array field!")
  }
  if (!body['keys'].every(key => typeof key !== 'object' || !key)) {
    throw new Error("Expected every item in 'keys' array to be an object!")
  }
  const keys: object[] = body['keys'];
  return { keys };
}

export default loadRemoteJwks;
