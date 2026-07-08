import { createJwksAccessProofToken } from "@schemavaults/jwt";
import { z } from "zod";
import allowedOriginsEndpoint from "./allowedOriginsEndpoint";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";

export interface ILoadRemoteAllowedOriginsOpts {
  auth_server_url: string;
  api_server_id: ApiServerId;
  jwks_access_private_key: CryptoKey;
  debug?: boolean;
}

const allowedOriginsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    origins: z.array(z.string()),
  }),
});

export async function loadRemoteAllowedOrigins({
  auth_server_url,
  api_server_id,
  jwks_access_private_key,
  ...opts
}: ILoadRemoteAllowedOriginsOpts): Promise<readonly string[]> {
  const debug: boolean = typeof opts.debug === "boolean" ? opts.debug : false;

  if (typeof auth_server_url !== "string") {
    throw new TypeError("Expected 'auth_server_url' to be a string!");
  } else if (
    !auth_server_url.startsWith("http://") &&
    !auth_server_url.startsWith("https://")
  ) {
    throw new TypeError(
      "Expected 'auth_server_url' to start with http:// or https://",
    );
  }

  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError(
      "Invalid API server ID to load remote allowed origins for!",
    );
  }

  let jwks_access_proof_token: string;
  try {
    jwks_access_proof_token = await createJwksAccessProofToken({
      api_server_id,
      auth_server_url,
      private_key: jwks_access_private_key,
    });
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to create JWKS Access Proof Token!");
  }

  const endpoint: URL = new URL(
    `${allowedOriginsEndpoint(api_server_id)}`,
    auth_server_url,
  );
  const response: Response = await fetch(endpoint, {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${jwks_access_proof_token}`,
    }),
  });
  if (!response.ok || response.status !== 200) {
    throw new Error(
      `Failed to load allowed origins from auth server: ${response.status} ${response.statusText}`,
    );
  }
  const body: unknown = await response.json();
  const parsed = allowedOriginsResponseSchema.safeParse(body);
  if (!parsed.success) {
    if (debug) {
      console.error(
        "Bad allowed-origins response body that caused error: ",
        body,
      );
    }
    throw new Error(
      "Unexpected response body shape when loading allowed origins from auth server!",
    );
  }
  return parsed.data.data.origins;
}

export default loadRemoteAllowedOrigins;
