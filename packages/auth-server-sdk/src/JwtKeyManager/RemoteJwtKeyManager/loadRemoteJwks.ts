import { createJwksAccessProofToken, type JWKS } from "@schemavaults/jwt";
import jwksEndpoint from "./jwksEndpoint";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";

export interface ILoadRemoteJwksOpts {
  auth_server_uri: string;
  api_server_id: ApiServerId;
  jwks_access_private_key: CryptoKey;
  debug?: boolean;
}

export async function loadRemoteJwks({
  auth_server_uri,
  api_server_id,
  jwks_access_private_key,
  ...opts
}: ILoadRemoteJwksOpts): Promise<JWKS> {
  const debug: boolean = typeof opts.debug === "boolean" ? opts.debug : false;

  if (typeof auth_server_uri !== "string") {
    throw new TypeError("Expected 'auth_server_uri' to be a string!");
  } else if (
    !auth_server_uri.startsWith("http://") &&
    !auth_server_uri.startsWith("https://")
  ) {
    throw new TypeError(
      "Expected 'auth_server_uri' to start with http:// or https://",
    );
  }

  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID to load remote JWKS for!");
  }

  let jwks_access_proof_token: string;
  try {
    jwks_access_proof_token = await createJwksAccessProofToken({
      api_server_id,
      private_key: jwks_access_private_key,
    });
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to create JWKS Access Proof Token!");
  }

  const response: Response = await fetch(
    `${auth_server_uri}${jwksEndpoint(api_server_id)}`,
    {
      method: "GET",
      headers: new Headers({
        Authorization: `Bearer ${jwks_access_proof_token}`,
      }),
    },
  );
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
