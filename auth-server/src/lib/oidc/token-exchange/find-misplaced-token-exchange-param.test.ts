import { describe, expect, test } from "bun:test";
import {
  TOKEN_ENDPOINT_GRANT_TYPES,
  type TokenEndpointGrantType,
} from "@/lib/oauth2/client-grant-types";
import {
  TOKEN_EXCHANGE_ONLY_PARAMS,
  findMisplacedTokenExchangeParam,
} from "./find-misplaced-token-exchange-param";
import { TOKEN_EXCHANGE_GRANT_TYPE } from "./token-exchange-constants";

/** The token endpoint's form accessor over `fields` (empty values read as absent). */
function param(fields: Record<string, string>): (name: string) => string | null {
  return (name: string): string | null => {
    const value = fields[name];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
}

const OTHER_GRANTS: readonly TokenEndpointGrantType[] = TOKEN_ENDPOINT_GRANT_TYPES.filter(
  (grant_type) => grant_type !== TOKEN_EXCHANGE_GRANT_TYPE,
);

describe("findMisplacedTokenExchangeParam", () => {
  test("covers the RFC 8693 request parameters", () => {
    expect([...TOKEN_EXCHANGE_ONLY_PARAMS]).toEqual([
      "subject_token",
      "subject_token_type",
      "requested_token_type",
      "actor_token",
      "actor_token_type",
    ]);
  });

  test("names any of them on every other grant", () => {
    expect(OTHER_GRANTS).toEqual(["authorization_code", "refresh_token", "client_credentials"]);
    for (const grant_type of OTHER_GRANTS) {
      for (const name of TOKEN_EXCHANGE_ONLY_PARAMS) {
        expect(findMisplacedTokenExchangeParam(grant_type, param({ [name]: "x" }))).toBe(name);
      }
    }
  });

  test("names the first one when several are present", () => {
    expect(
      findMisplacedTokenExchangeParam(
        "refresh_token",
        param({ actor_token: "a", subject_token_type: "t", subject_token: "s" }),
      ),
    ).toBe("subject_token");
  });

  test("lets a token exchange request carry them", () => {
    const all = Object.fromEntries(TOKEN_EXCHANGE_ONLY_PARAMS.map((name) => [name, "x"]));
    expect(findMisplacedTokenExchangeParam(TOKEN_EXCHANGE_GRANT_TYPE, param(all))).toBeNull();
  });

  test("ignores the other grants' own parameters, empty values and `audience`", () => {
    for (const grant_type of OTHER_GRANTS) {
      expect(
        findMisplacedTokenExchangeParam(
          grant_type,
          param({
            code: "c",
            code_verifier: "v",
            redirect_uri: "https://app.example/cb",
            refresh_token: "r",
            scope: "openid",
            resource: "https://api.example",
            // Sent by many OAuth client libraries with every grant.
            audience: "https://api.example",
            // Empty values are treated as absent (RFC 6749 §3.2).
            subject_token: "",
            actor_token: "",
          }),
        ),
      ).toBeNull();
    }
  });
});
