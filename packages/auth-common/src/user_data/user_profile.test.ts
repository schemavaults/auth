import { describe, expect, test } from "bun:test";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  MAX_USER_NAME_PART_LENGTH,
  updateUserProfileRequestSchema,
  userDisplayNameSchema,
  userNamePartSchema,
  userProfileNamesSchema,
  usernameFormatSchema,
} from "./user_profile";

describe("usernameFormatSchema", () => {
  test("accepts typical usernames", () => {
    for (const username of [
      "abc",
      "alice",
      "Alice-42",
      "j.doe",
      "some_user-name.99",
      "A".repeat(USERNAME_MAX_LENGTH),
    ]) {
      expect(usernameFormatSchema.safeParse(username).success).toBe(true);
    }
  });

  test("rejects malformed usernames", () => {
    for (const username of [
      "",
      "ab", // below minimum length
      "A".repeat(USERNAME_MAX_LENGTH + 1),
      ".starts-with-dot",
      "ends-with-dash-",
      "_leading_underscore",
      "has spaces",
      "has@sign", // must never look like an email
      "pipe|char", // the OIDC sub-claim delimiter
      "emoji💥name",
    ]) {
      expect(usernameFormatSchema.safeParse(username).success).toBe(false);
    }
    expect(USERNAME_MIN_LENGTH).toBeGreaterThan(0);
  });
});

describe("userNamePartSchema / userDisplayNameSchema", () => {
  test("accepts human names including unicode", () => {
    for (const name of ["Ada", "María-José", "van der Berg", "李", "O'Brien"]) {
      expect(userNamePartSchema.safeParse(name).success).toBe(true);
      expect(userDisplayNameSchema.safeParse(name).success).toBe(true);
    }
  });

  test("trims surrounding whitespace", () => {
    const parsed = userNamePartSchema.safeParse("  Ada Lovelace  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("Ada Lovelace");
    }
  });

  test("rejects empty, oversized, and control-character names", () => {
    for (const name of [
      "",
      "   ", // whitespace-only trims to empty
      "A".repeat(MAX_USER_NAME_PART_LENGTH + 1),
      "line\nbreak",
      "null\u0000byte",
    ]) {
      expect(userNamePartSchema.safeParse(name).success).toBe(false);
    }
  });
});

describe("userProfileNamesSchema", () => {
  test("accepts an empty profile and a full profile", () => {
    expect(userProfileNamesSchema.safeParse({}).success).toBe(true);
    expect(
      userProfileNamesSchema.safeParse({
        username: "ada.lovelace",
        first_name: "Ada",
        middle_name: "King",
        last_name: "Lovelace",
        display_name: "Countess of Lovelace",
      }).success,
    ).toBe(true);
  });

  test("rejects unknown keys (strict)", () => {
    expect(
      userProfileNamesSchema.safeParse({ nickname: "ada" }).success,
    ).toBe(false);
  });
});

describe("updateUserProfileRequestSchema", () => {
  test("accepts null to clear a field", () => {
    const parsed = updateUserProfileRequestSchema.safeParse({
      username: "ada",
      first_name: null,
      display_name: "Ada",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects invalid values even when nullable", () => {
    expect(
      updateUserProfileRequestSchema.safeParse({ username: "a" }).success,
    ).toBe(false);
    expect(
      updateUserProfileRequestSchema.safeParse({ first_name: "" }).success,
    ).toBe(false);
  });
});
