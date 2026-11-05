import { describe, expect, test } from "bun:test";
import {
  TOKEN_ENDPOINT_GRANT_TYPES,
  type TokenEndpointGrantType,
} from "@/lib/oauth2/client-grant-types";
import {
  PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE,
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

/** Parameters every grant shares. */
const SHARED = {
  client_id: "my-app",
  client_secret: "s3cret",
  scope: "openid",
  resource: "https://api.example",
} as const;

describe("findMisplacedTokenExchangeParam", () => {
  test("covers the RFC 8693 request parameters and the other grants' own", () => {
    expect([...TOKEN_EXCHANGE_ONLY_PARAMS]).toEqual([
      "subject_token",
      "subject_token_type",
      "requested_token_type",
      "actor_token",
      "actor_token_type",
    ]);
    expect([...PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE]).toEqual([
      "code",
      "code_verifier",
      "redirect_uri",
      "refresh_token",
      "refresh_token_delivery",
    ]);
  });

  describe("on the other grants", () => {
    test("names any RFC 8693 parameter", () => {
      expect(OTHER_GRANTS).toEqual(["authorization_code", "refresh_token", "client_credentials"]);
      for (const grant_type of OTHER_GRANTS) {
        for (const name of TOKEN_EXCHANGE_ONLY_PARAMS) {
          expect(findMisplacedTokenExchangeParam(grant_type, param({ [name]: "x" }))).toEqual({
            name,
            error_description: `'${name}' is only allowed with grant_type=${TOKEN_EXCHANGE_GRANT_TYPE}.`,
          });
        }
      }
    });

    test("names the first one when several are present", () => {
      expect(
        findMisplacedTokenExchangeParam(
          "refresh_token",
          param({ actor_token: "a", subject_token_type: "t", subject_token: "s" }),
        )?.name,
      ).toBe("subject_token");
    });

    test("ignores their own and the shared parameters, empty values and `audience`", () => {
      for (const grant_type of OTHER_GRANTS) {
        expect(
          findMisplacedTokenExchangeParam(
            grant_type,
            param({
              ...SHARED,
              code: "c",
              code_verifier: "v",
              redirect_uri: "https://app.example/cb",
              refresh_token: "r",
              refresh_token_delivery: "http_only_cookie",
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

  describe("on a token exchange", () => {
    test("names any other grant's parameter", () => {
      for (const name of PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE) {
        expect(
          findMisplacedTokenExchangeParam(
            TOKEN_EXCHANGE_GRANT_TYPE,
            param({ subject_token: "s", subject_token_type: "t", [name]: "x" }),
          ),
        ).toEqual({
          name,
          error_description: `'${name}' is not allowed with grant_type=${TOKEN_EXCHANGE_GRANT_TYPE}.`,
        });
      }
    });

    test("allows its own and the shared parameters, and empty values", () => {
      const own = Object.fromEntries(TOKEN_EXCHANGE_ONLY_PARAMS.map((name) => [name, "x"]));
      const empty = Object.fromEntries(PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE.map((name) => [name, ""]));
      expect(
        findMisplacedTokenExchangeParam(TOKEN_EXCHANGE_GRANT_TYPE, param({ ...SHARED, ...own, ...empty })),
      ).toBeNull();
    });
  });
});
