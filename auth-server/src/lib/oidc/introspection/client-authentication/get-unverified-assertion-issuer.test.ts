import { describe, expect, test } from "bun:test";
import { getUnverifiedAssertionIssuer } from "./get-unverified-assertion-issuer";

function jwtWithPayload(payload: unknown): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature`;
}

describe("getUnverifiedAssertionIssuer", () => {
  test("reads the `iss` claim without verifying the signature", () => {
    expect(
      getUnverifiedAssertionIssuer(jwtWithPayload({ iss: "api-server-1" })),
    ).toBe("api-server-1");
  });

  test("returns null without a string `iss`", () => {
    expect(getUnverifiedAssertionIssuer(jwtWithPayload({ sub: "x" }))).toBeNull();
    expect(getUnverifiedAssertionIssuer(jwtWithPayload({ iss: 42 }))).toBeNull();
    expect(getUnverifiedAssertionIssuer(jwtWithPayload("iss"))).toBeNull();
    expect(getUnverifiedAssertionIssuer(jwtWithPayload(null))).toBeNull();
  });

  test("returns null for anything that is not a three-part JWT", () => {
    expect(getUnverifiedAssertionIssuer("not-a-jwt")).toBeNull();
    expect(getUnverifiedAssertionIssuer("a..c")).toBeNull();
    expect(getUnverifiedAssertionIssuer("a.b.c.d")).toBeNull();
    expect(getUnverifiedAssertionIssuer("a.!!!.c")).toBeNull();
  });
});
