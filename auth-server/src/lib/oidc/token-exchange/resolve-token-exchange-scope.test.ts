import { describe, expect, test } from "bun:test";
import { resolveTokenExchangeScope } from "./resolve-token-exchange-scope";

const API_SERVER_ID = "6f1c1d0e-8a39-4a8e-9b1a-3f5f1b0f2a11";
const NOTES_READ = "notes:read";
const NOTES_WRITE = "notes:write";
const DEFINED: ReadonlySet<string> = new Set([NOTES_READ, NOTES_WRITE]);

function resolve(
  subject_scope: string | null,
  requested_scope: string | null,
  usable_api_scopes: ReadonlySet<string> = DEFINED,
) {
  return resolveTokenExchangeScope({
    subject_scope,
    requested_scope,
    api_server_id: API_SERVER_ID,
    defined_api_scopes: DEFINED,
    usable_api_scopes,
  });
}

describe("resolveTokenExchangeScope", () => {
  test("without 'scope', the delegated token gets the subject token's scope", () => {
    expect(resolve(`openid email ${NOTES_READ} ${NOTES_WRITE}`, null)).toEqual({
      ok: true,
      scope: `openid email ${NOTES_READ} ${NOTES_WRITE}`,
    });
    // A plain OAuth 2.1 subject token (no scope claim) stays scope-less.
    expect(resolve(null, null)).toEqual({ ok: true, scope: "" });
  });

  test("'scope' narrows the subject token's scope", () => {
    expect(resolve(`openid email ${NOTES_READ} ${NOTES_WRITE}`, NOTES_READ)).toEqual({
      ok: true,
      scope: NOTES_READ,
    });
    expect(resolve(`openid ${NOTES_READ}`, `openid ${NOTES_READ}`)).toEqual({
      ok: true,
      scope: `openid ${NOTES_READ}`,
    });
  });

  test("'scope' never widens it", () => {
    expect(resolve(`openid ${NOTES_READ}`, `${NOTES_READ} ${NOTES_WRITE}`)).toEqual({
      ok: false,
      reason: "exceeds_grant",
    });
    expect(resolve(NOTES_READ, "openid email")).toEqual({
      ok: false,
      reason: "exceeds_grant",
    });
  });

  test("unknown scope values are dropped, malformed ones refused", () => {
    expect(resolve(`openid ${NOTES_READ}`, `${NOTES_READ} admin:everything`)).toEqual({
      ok: true,
      scope: NOTES_READ,
    });
    expect(resolve(`openid ${NOTES_READ}`, "notes:read\u0000")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  test("API scopes the user withdrew or the app lost meanwhile drop off", () => {
    // The subject token still carries notes:write, but it is no longer
    // usable (consent withdrawn / allowance removed since it was minted).
    const usable: ReadonlySet<string> = new Set([NOTES_READ]);
    expect(resolve(`openid ${NOTES_READ} ${NOTES_WRITE}`, null, usable)).toEqual({
      ok: true,
      scope: `openid ${NOTES_READ}`,
    });
    expect(resolve(`openid ${NOTES_READ} ${NOTES_WRITE}`, NOTES_WRITE, usable)).toEqual({
      ok: true,
      scope: "",
    });
  });
});
