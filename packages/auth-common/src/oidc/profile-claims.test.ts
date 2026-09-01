import { describe, expect, test } from "bun:test";
import { buildOidcProfileClaims } from "./profile-claims";

describe("buildOidcProfileClaims", () => {
  test("returns no claims for an empty profile", () => {
    expect(buildOidcProfileClaims({})).toEqual({});
  });

  test("prefers the display name for the `name` claim", () => {
    expect(
      buildOidcProfileClaims({
        display_name: "Countess of Lovelace",
        first_name: "Ada",
        last_name: "Lovelace",
      }),
    ).toEqual({
      name: "Countess of Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
    });
  });

  test("falls back to joined name parts when no display name is set", () => {
    expect(
      buildOidcProfileClaims({
        first_name: "Ada",
        middle_name: "King",
        last_name: "Lovelace",
      }),
    ).toEqual({
      name: "Ada King Lovelace",
      given_name: "Ada",
      middle_name: "King",
      family_name: "Lovelace",
    });
  });

  test("maps username to preferred_username", () => {
    expect(buildOidcProfileClaims({ username: "ada.lovelace" })).toEqual({
      preferred_username: "ada.lovelace",
    });
  });

  test("omits `name` entirely when no name fields are set", () => {
    const claims = buildOidcProfileClaims({ username: "ada" });
    expect(Object.hasOwn(claims, "name")).toBe(false);
  });
});
