import { describe, test, expect } from "bun:test";
import type { UserData } from "@schemavaults/auth-common";
import { isSameUserData } from "./is-same-user-data";

const UID = "3f2d1c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

function makeUser(overrides: Partial<UserData> = {}): UserData {
  return {
    uid: UID,
    sub: UID,
    email: "user@example.com",
    email_verified: false,
    admin: false,
    disabled: false,
    created_at: 1700000000000,
    ...overrides,
  };
}

describe("isSameUserData", () => {
  test("equal objects compare equal", () => {
    expect(isSameUserData(makeUser(), makeUser())).toBe(true);
  });

  test("is independent of key insertion order", () => {
    const reordered = JSON.parse(
      JSON.stringify({
        created_at: 1700000000000,
        email: "user@example.com",
        admin: false,
        disabled: false,
        email_verified: false,
        sub: UID,
        uid: UID,
      }),
    ) as UserData;
    expect(isSameUserData(makeUser(), reordered)).toBe(true);
  });

  test("detects a changed claim (email_verified flip)", () => {
    expect(
      isSameUserData(makeUser(), makeUser({ email_verified: true })),
    ).toBe(false);
  });

  test("detects added/removed optional fields", () => {
    expect(
      isSameUserData(makeUser(), makeUser({ invite_code: undefined })),
    ).toBe(true);
    const withInvite = { ...makeUser(), invite_code: "abc123" } as UserData;
    expect(isSameUserData(makeUser(), withInvite)).toBe(false);
  });

  test("null handling", () => {
    expect(isSameUserData(null, null)).toBe(true);
    expect(isSameUserData(makeUser(), null)).toBe(false);
    expect(isSameUserData(null, makeUser())).toBe(false);
  });
});
