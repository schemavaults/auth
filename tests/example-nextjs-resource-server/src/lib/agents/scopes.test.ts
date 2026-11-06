import { describe, expect, mock, test } from "bun:test";
import { AGENTS_SIGN_IN_SCOPE, NOTES_READ_SCOPE, delegatedScopeFor } from "./scopes";

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

  test("ignores scopes the app does not offer", () => {
    expect(delegatedScopeFor(["example:notes.write", "admin"])).toBe("openid");
  });

  test("matches the scope the notes operation requires", async () => {
    const { EXAMPLE_NOTES_READ_SCOPE } = await import("@/app/api/me/notes/operation");
    expect(NOTES_READ_SCOPE).toBe(EXAMPLE_NOTES_READ_SCOPE);
  });
});
