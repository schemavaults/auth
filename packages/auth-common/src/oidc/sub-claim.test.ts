import { describe, expect, test } from "bun:test";
import {
  OIDC_SUB_CLAIM_DELIMITER,
  formatOidcSubClaim,
  parseOidcSubClaim,
} from "./sub-claim";

const UID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;

describe("formatOidcSubClaim", () => {
  test("prefixes the uid with the auth server app id", () => {
    expect(formatOidcSubClaim("schemavaults-auth", UID)).toBe(
      `schemavaults-auth${OIDC_SUB_CLAIM_DELIMITER}${UID}`,
    );
  });

  test("accepts white-label app ids", () => {
    expect(formatOidcSubClaim("acme-corp_auth0", UID)).toBe(
      `acme-corp_auth0|${UID}`,
    );
  });

  test("rejects an invalid app id", () => {
    expect(() => formatOidcSubClaim("Not An App Id!", UID)).toThrow(TypeError);
    expect(() => formatOidcSubClaim("", UID)).toThrow(TypeError);
  });

  test("rejects an empty uid", () => {
    expect(() => formatOidcSubClaim("schemavaults-auth", "")).toThrow(
      TypeError,
    );
  });
});

describe("parseOidcSubClaim", () => {
  test("round-trips formatOidcSubClaim output", () => {
    const sub = formatOidcSubClaim("schemavaults-auth", UID);
    expect(parseOidcSubClaim(sub)).toEqual({
      auth_server_app_id: "schemavaults-auth",
      uid: UID,
    });
  });

  test("splits on the FIRST delimiter only", () => {
    expect(parseOidcSubClaim(`my-auth|weird|uid`)).toEqual({
      auth_server_app_id: "my-auth",
      uid: "weird|uid",
    });
  });

  test("returns null for subjects without the platform shape", () => {
    expect(parseOidcSubClaim(UID)).toBeNull(); // bare uid, no prefix
    expect(parseOidcSubClaim("")).toBeNull();
    expect(parseOidcSubClaim("|leading-delimiter")).toBeNull();
    expect(parseOidcSubClaim("trailing-delimiter|")).toBeNull();
    expect(parseOidcSubClaim("Not A Valid App Id|uid")).toBeNull();
  });
});
