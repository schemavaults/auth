import { describe, expect, test } from "bun:test";
import { uidFromOidcSubClaim } from "./uid-from-oidc-sub-claim";

const UID = "4f7c1c2e-9a4b-4e7a-8c2d-1b2a3c4d5e6f";

describe("uidFromOidcSubClaim", () => {
  test("extracts the uid from a namespaced sub claim", () => {
    expect(uidFromOidcSubClaim(`schemavaults-auth|${UID}`, "schemavaults-auth")).toBe(
      UID,
    );
  });

  test("tolerates a sub namespaced by a different auth server app id", () => {
    // The issuer check pins the deployment; the prefix is informational.
    expect(uidFromOidcSubClaim(`acme-auth|${UID}`, "schemavaults-auth")).toBe(
      UID,
    );
  });

  test("rejects a bare / missing sub", () => {
    expect(() => uidFromOidcSubClaim(UID, "schemavaults-auth")).toThrow();
    expect(() => uidFromOidcSubClaim(undefined, "schemavaults-auth")).toThrow(
      TypeError,
    );
  });
});
