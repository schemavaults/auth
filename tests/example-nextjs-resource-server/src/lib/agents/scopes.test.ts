import { describe, expect, mock, test } from "bun:test";
import { AGENTS_SIGN_IN_SCOPE, NOTES_READ_SCOPE, delegatedScopeFor, delegatedScopesFor } from "./scopes";

mock.module("server-only", () => ({}));

describe("agent scopes", () => {
  test("signs users in for everything an agent may be given", () => {
    expect(AGENTS_SIGN_IN_SCOPE).toBe("openid email example:notes.read");
  });

  test("narrows a delegated token to the picked scopes, always keeping openid", () => {
    expect(delegatedScopeFor(["example:notes.read"])).toBe("openid example:notes.read");
    expect(delegatedScopeFor([])).toBe("openid");
    expect(delegatedScopeFor(["example:notes.read", "email"])).toBe("openid email example:notes.read");
  });

  test("gives the token exchange the picked scopes as definitions", () => {
    expect(delegatedScopesFor(["example:notes.read"])).toEqual([
      { scope: "openid", description: "Sign you in with OpenID Connect" },
      { scope: "example:notes.read", description: "Read your notes" },
    ]);
  });

  test("ignores scopes the app does not offer", () => {
    expect(delegatedScopeFor(["example:notes.write", "admin"])).toBe("openid");
  });

  test("matches the scope the notes operation requires", async () => {
    const { EXAMPLE_NOTES_READ_SCOPE } = await import("@/app/api/me/notes/operation");
    expect(NOTES_READ_SCOPE).toBe(EXAMPLE_NOTES_READ_SCOPE);
  });

  test("offers only scopes some operation requires, labelled with their descriptions", async () => {
    const { AGENT_SCOPE_OPTIONS } = await import("./scopes");
    const { openApiDocument } = await import("@/lib/api/openapi-document");
    const documented = new Map(
      (openApiDocument["x-schemavaults-scopes"] as { scope: string; description?: string }[]).map(
        (entry) => [entry.scope, entry.description],
      ),
    );
    for (const option of AGENT_SCOPE_OPTIONS) {
      expect(documented.get(option.scope)).toBe(option.label);
    }
    expect(AGENT_SCOPE_OPTIONS.map((option) => option.label)).toEqual([
      "Read your email address",
      "Read your notes",
    ]);
  });
});
