import { describe, expect, test } from "bun:test";
import { schemaVaultsApiServerDefinitionSchema } from "./api-server-definition";
import { doesApiServerAcceptDelegatedTokens } from "./api-server-delegated-tokens";

const BASE_DEFINITION = {
  api_server_id: "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b",
  api_server_name: "Notes MCP",
  api_server_description: "An MCP server",
  created_at: 1_700_000_000_000,
  public: false,
  hardcoded: false,
  owner_type: "organization",
  owner_organization_id: "acme",
} as const;

describe("accept_delegated_tokens on API server definitions", () => {
  test("is optional: definitions without it still parse", () => {
    const parsed = schemaVaultsApiServerDefinitionSchema.safeParse(BASE_DEFINITION);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.accept_delegated_tokens).toBeUndefined();
  });

  test("parses a boolean and refuses anything else", () => {
    for (const value of [true, false]) {
      const parsed = schemaVaultsApiServerDefinitionSchema.safeParse({
        ...BASE_DEFINITION,
        accept_delegated_tokens: value,
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.accept_delegated_tokens).toBe(value);
    }
    for (const value of ["true", 1, null]) {
      expect(
        schemaVaultsApiServerDefinitionSchema.safeParse({
          ...BASE_DEFINITION,
          accept_delegated_tokens: value,
        }).success,
      ).toBe(false);
    }
  });
});

describe("doesApiServerAcceptDelegatedTokens", () => {
  test("accepts only a registered API server that opted in", () => {
    expect(
      doesApiServerAcceptDelegatedTokens({ hardcoded: false, accept_delegated_tokens: true }),
    ).toBe(true);
  });

  test("refuses by default: flag absent or false", () => {
    expect(doesApiServerAcceptDelegatedTokens({ hardcoded: false })).toBe(false);
    expect(
      doesApiServerAcceptDelegatedTokens({ hardcoded: false, accept_delegated_tokens: false }),
    ).toBe(false);
  });

  test("refuses a hardcoded API server even if it claims to accept them", () => {
    expect(
      doesApiServerAcceptDelegatedTokens({ hardcoded: true, accept_delegated_tokens: true }),
    ).toBe(false);
  });

  test("refuses an unknown API server", () => {
    expect(doesApiServerAcceptDelegatedTokens(null)).toBe(false);
    expect(doesApiServerAcceptDelegatedTokens(undefined)).toBe(false);
  });
});
