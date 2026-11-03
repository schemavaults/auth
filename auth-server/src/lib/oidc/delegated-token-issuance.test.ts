import { describe, expect, test } from "bun:test";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getHardcodedSchemaVaultsApis,
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import DelegatedTokensNotAcceptedError from "@/lib/error/DelegatedTokensNotAcceptedError";
import { assertDelegatedTokenIssuance } from "./delegated-token-issuance";

const API_SERVER_ID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b";

function registered(accept_delegated_tokens?: boolean): SchemaVaultsApiServerDefinition {
  return {
    api_server_id: API_SERVER_ID,
    api_server_name: "Notes MCP",
    api_server_description: "An MCP server",
    created_at: 1_700_000_000_000,
    public: false,
    hardcoded: false,
    ...(accept_delegated_tokens === undefined ? {} : { accept_delegated_tokens }),
  };
}

/** A loader over a fixed set of definitions, recording what it was asked. */
function loaderFor(definitions: readonly SchemaVaultsApiServerDefinition[]) {
  const asked: ApiServerId[] = [];
  const loadApiServer = async (id: ApiServerId) => {
    asked.push(id);
    return definitions.find((d) => d.api_server_id === id) ?? null;
  };
  return { loadApiServer, asked };
}

const ACCESS_TOKEN_ONLY = { issue_refresh_token: false, include_id_token: false } as const;

describe("assertDelegatedTokenIssuance", () => {
  test("allows an access token for an API server that accepts delegated tokens", async () => {
    const { loadApiServer } = loaderFor([registered(true)]);
    await assertDelegatedTokenIssuance({
      api_server_id: API_SERVER_ID,
      ...ACCESS_TOKEN_ONLY,
      loadApiServer,
    });
  });

  test("refuses an API server that has not opted in", async () => {
    for (const definition of [registered(), registered(false)]) {
      const { loadApiServer } = loaderFor([definition]);
      const attempt = assertDelegatedTokenIssuance({
        api_server_id: API_SERVER_ID,
        ...ACCESS_TOKEN_ONLY,
        loadApiServer,
      });
      await expect(attempt).rejects.toBeInstanceOf(DelegatedTokensNotAcceptedError);
    }
  });

  test("refuses the hardcoded API servers: the auth server and the userinfo audience", async () => {
    const hardcoded = getHardcodedSchemaVaultsApis();
    expect(hardcoded.length).toBeGreaterThan(0);
    // Even a hardcoded definition claiming to accept them is refused.
    const { loadApiServer } = loaderFor(
      hardcoded.map((d) => ({ ...d, accept_delegated_tokens: true })),
    );
    for (const { api_server_id } of hardcoded) {
      await expect(
        assertDelegatedTokenIssuance({ api_server_id, ...ACCESS_TOKEN_ONLY, loadApiServer }),
      ).rejects.toBeInstanceOf(DelegatedTokensNotAcceptedError);
    }
    expect(hardcoded.map((d) => d.api_server_id)).toContain(OIDC_USERINFO_AUDIENCE_ID);
  });

  test("refuses an unknown API server, and an invalid id without loading anything", async () => {
    const { loadApiServer, asked } = loaderFor([]);
    await expect(
      assertDelegatedTokenIssuance({ api_server_id: API_SERVER_ID, ...ACCESS_TOKEN_ONLY, loadApiServer }),
    ).rejects.toBeInstanceOf(DelegatedTokensNotAcceptedError);
    await expect(
      assertDelegatedTokenIssuance({ api_server_id: "Not An Id!", ...ACCESS_TOKEN_ONLY, loadApiServer }),
    ).rejects.toBeInstanceOf(DelegatedTokensNotAcceptedError);
    expect(asked).toEqual([API_SERVER_ID]);
  });

  test("refuses to mint a refresh token or an id_token alongside, before loading anything", async () => {
    const { loadApiServer, asked } = loaderFor([registered(true)]);
    for (const alongside of [
      { issue_refresh_token: true, include_id_token: false },
      { issue_refresh_token: false, include_id_token: true },
    ]) {
      await expect(
        assertDelegatedTokenIssuance({ api_server_id: API_SERVER_ID, ...alongside, loadApiServer }),
      ).rejects.toThrow(TypeError);
    }
    expect(asked).toEqual([]);
  });
});
