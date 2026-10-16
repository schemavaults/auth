import { createJwksAccessProofToken, type JWKS } from "@schemavaults/jwt";
import jwksEndpoint from "./jwksEndpoint";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { JwtKeyManagerMisconfigurationError } from "@/JwtKeyManager/JwtKeyManagerMisconfigurationError";
import { JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME } from "@/env/loadJwksAccessPrivateKey";

/**
 * A 4xx answer is the auth server refusing this request (an assertion it
 * does not accept, an unknown or reserved API server id); 408 and 429 are
 * transient.
 */
export function isJwksDownloadRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export interface ILoadRemoteJwksOpts {
  auth_server_url: string;
  api_server_id: ApiServerId;
  jwks_access_private_key: CryptoKey;
  debug?: boolean;
}

export async function loadRemoteJwks({
  auth_server_url,
  api_server_id,
  jwks_access_private_key,
  ...opts
}: ILoadRemoteJwksOpts): Promise<JWKS> {
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
    throw new TypeError("Invalid API server ID to load remote JWKS for!");
  }

  let jwks_access_proof_token: string;
  try {
    jwks_access_proof_token = await createJwksAccessProofToken({
      api_server_id,
      auth_server_url,
      private_key: jwks_access_private_key,
    });
  } catch (e: unknown) {
    throw new JwtKeyManagerMisconfigurationError(
      "jwks_access_private_key_unusable",
      `Failed to sign a JWKS access assertion with the JWKS access private key ('${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}'): ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }

  const endpoint: URL = new URL(
    `${jwksEndpoint(api_server_id)}`,
    auth_server_url,
  );
  const response: Response = await fetch(endpoint, {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${jwks_access_proof_token}`,
    }),
  });
  if (isJwksDownloadRefusal(response.status)) {
    // Retrying cannot help: the auth server will refuse every assertion
    // until the key or the API server id is fixed.
    let detail: string = "";
    try {
      detail = (await response.text()).slice(0, 500);
    } catch {
      /* the status alone is enough */
    }
    throw new JwtKeyManagerMisconfigurationError(
      "jwks_download_refused",
      `The auth server at '${auth_server_url}' refused to send the JWKS of API server '${api_server_id}' (${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}). Check that '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' holds the API server's active JWKS access private key and that the API server id is correct.`,
      { status: response.status },
    );
  }
  if (!response.ok || response.status !== 200) {
    throw new Error(
      `Failed to load jwks.json from auth server: ${response.status} ${response.statusText}`,
    );
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new TypeError(
      "Expected result of loading jwks.json to be a JavaScript object!",
    );
  }
  if (!("keys" in body) || !Array.isArray(body["keys"])) {
    throw new Error(
      "Expected response body of jwks.json to have a 'keys' array field!",
    );
  }
  const nKeys: number = body["keys"].length;
  if (nKeys === 0) {
    return { keys: [] };
  }
  const allKeysHaveValidType: boolean = body["keys"].every(
    (key: unknown): key is object =>
      typeof key === "object" && key ? true : false,
  );
  if (!allKeysHaveValidType) {
    let errorMessage: string = `Not all items in 'keys' array (length=${nKeys}) are objects!`;
    const existingTypesInBadKeysArray = new Set<string>();
    for (const key of body["keys"]) {
      existingTypesInBadKeysArray.add(typeof key);
    }
    const badKeyTypes: readonly string[] = [
      ...existingTypesInBadKeysArray.values(),
    ];
    errorMessage += " ";
    errorMessage +=
      "Types in 'keys' array include: " +
      badKeyTypes.map((t): string => `"${t}"`).join(", ");
    if (debug) {
      console.error("Bad 'keys' array that caused error: ", body["keys"]);
    }
    throw new TypeError(errorMessage);
  }
  const keys: object[] = body["keys"];
  return { keys };
}

export default loadRemoteJwks;
