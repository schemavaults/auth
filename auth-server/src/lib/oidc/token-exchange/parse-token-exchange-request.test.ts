import { describe, expect, test } from "bun:test";
import { parseTokenExchangeRequest } from "./parse-token-exchange-request";
import { ACCESS_TOKEN_TYPE } from "./token-exchange-constants";

/** The token endpoint's form accessor over `fields` (empty values read as absent). */
function param(fields: Record<string, string>): (name: string) => string | null {
  return (name: string): string | null => {
    const value = fields[name];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
}

const VALID = {
  subject_token: "eyJ.subject.token",
  subject_token_type: ACCESS_TOKEN_TYPE,
} as const;

describe("parseTokenExchangeRequest", () => {
  test("reads the subject token of a well-formed request", () => {
    expect(parseTokenExchangeRequest(param(VALID))).toEqual({
      ok: true,
      request: { subject_token: VALID.subject_token },
    });
    // requested_token_type may name the one token type issued.
    expect(
      parseTokenExchangeRequest(param({ ...VALID, requested_token_type: ACCESS_TOKEN_TYPE })),
    ).toEqual({ ok: true, request: { subject_token: VALID.subject_token } });
  });

  test("requires subject_token and subject_token_type", () => {
    const missing_token = parseTokenExchangeRequest(
      param({ subject_token_type: ACCESS_TOKEN_TYPE }),
    );
    expect(missing_token).toEqual({
      ok: false,
      error: { error: "invalid_request", error_description: "Missing 'subject_token' parameter." },
    });
    const missing_type = parseTokenExchangeRequest(param({ subject_token: "x" }));
    expect(missing_type).toEqual({
      ok: false,
      error: { error: "invalid_request", error_description: "Missing 'subject_token_type' parameter." },
    });
    // An empty value is absent, like every other form field.
    expect(parseTokenExchangeRequest(param({ ...VALID, subject_token: "" })).ok).toBe(false);
  });

  test("exchanges access tokens only", () => {
    for (const subject_token_type of [
      "urn:ietf:params:oauth:token-type:refresh_token",
      "urn:ietf:params:oauth:token-type:id_token",
      "urn:ietf:params:oauth:token-type:jwt",
      "access_token",
    ]) {
      const result = parseTokenExchangeRequest(param({ ...VALID, subject_token_type }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.error).toBe("invalid_request");
    }
  });

  test("issues access tokens only", () => {
    const result = parseTokenExchangeRequest(
      param({ ...VALID, requested_token_type: "urn:ietf:params:oauth:token-type:refresh_token" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("invalid_request");
  });

  test("refuses an actor token: the actor is the client's service account", () => {
    const extras: Record<string, string>[] = [
      { actor_token: "eyJ.actor.token", actor_token_type: ACCESS_TOKEN_TYPE },
      { actor_token: "eyJ.actor.token" },
      { actor_token_type: ACCESS_TOKEN_TYPE },
    ];
    for (const extra of extras) {
      const result = parseTokenExchangeRequest(param({ ...VALID, ...extra }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.error).toBe("invalid_request");
    }
  });

  test("refuses 'audience': the target is named with 'resource'", () => {
    const result = parseTokenExchangeRequest(param({ ...VALID, audience: "notes-api" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("invalid_target");
  });
});
