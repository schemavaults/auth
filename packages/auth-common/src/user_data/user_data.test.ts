import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import {
  createUserDataSchema,
  isUserDataSubClaim,
  toUserDataSubClaim,
  uidFromUserDataSubClaim,
  userDataSchema,
} from "./user_data";

const UID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;
const OTHER_UID = "11111111-1111-4111-8111-111111111111" as const;

const BASE = {
  uid: UID,
  email: "user@example.com",
  created_at: 1_700_000_000_000,
} as const;

describe("userDataSchema `sub`", () => {
  const original_app_id = process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID;
  beforeEach(() => {
    delete process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID;
  });
  afterEach(() => {
    if (original_app_id === undefined) {
      delete process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID;
    } else {
      process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID = original_app_id;
    }
  });

  test("accepts the OIDC form unchanged", () => {
    const parsed = userDataSchema.parse({
      ...BASE,
      sub: `acme-corp-auth|${UID}`,
    });
    expect(parsed.sub).toBe(`acme-corp-auth|${UID}`);
  });

  test("lazily upgrades a bare uuid with the default auth server app id", () => {
    const parsed = userDataSchema.parse({ ...BASE, sub: UID });
    expect(parsed.sub).toBe(`${DEFAULT_AUTH_SERVER_APP_ID}|${UID}`);
    expect(parsed.uid).toBe(UID);
  });

  test("resolves the default prefix from SCHEMAVAULTS_AUTH_SERVER_APP_ID at parse time", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID = "white-label-auth";
    expect(userDataSchema.parse({ ...BASE, sub: UID }).sub).toBe(
      `white-label-auth|${UID}`,
    );
  });

  test("createUserDataSchema upgrades with the configured app id", () => {
    const schema = createUserDataSchema({ auth_server_app_id: "acme-auth" });
    expect(schema.parse({ ...BASE, sub: UID }).sub).toBe(`acme-auth|${UID}`);
    const lazy = createUserDataSchema({ auth_server_app_id: () => "lazy-auth" });
    expect(lazy.parse({ ...BASE, sub: UID }).sub).toBe(`lazy-auth|${UID}`);
  });

  test("re-parsing parsed user data is stable", () => {
    const once = userDataSchema.parse({ ...BASE, sub: UID });
    expect(userDataSchema.parse(once)).toEqual(once);
  });

  test("rejects a subject naming a different user", () => {
    expect(
      userDataSchema.safeParse({ ...BASE, sub: `schemavaults-auth|${OTHER_UID}` })
        .success,
    ).toBe(false);
    expect(userDataSchema.safeParse({ ...BASE, sub: OTHER_UID }).success).toBe(
      false,
    );
  });

  test("rejects a missing or malformed subject", () => {
    expect(userDataSchema.safeParse({ ...BASE }).success).toBe(false);
    expect(userDataSchema.safeParse({ ...BASE, sub: "garbage" }).success).toBe(
      false,
    );
    expect(
      userDataSchema.safeParse({ ...BASE, sub: "schemavaults-auth|not-a-uuid" })
        .success,
    ).toBe(false);
    expect(
      userDataSchema.safeParse({ ...BASE, sub: `Not An App Id|${UID}` })
        .success,
    ).toBe(false);
  });
});

describe("UserData subject helpers", () => {
  test("isUserDataSubClaim only accepts `<app_id>|<uuid>`", () => {
    expect(isUserDataSubClaim(`schemavaults-auth|${UID}`)).toBe(true);
    expect(isUserDataSubClaim(UID)).toBe(false);
    expect(isUserDataSubClaim("schemavaults-auth|abc")).toBe(false);
    expect(isUserDataSubClaim(42)).toBe(false);
  });

  test("toUserDataSubClaim upgrades bare uuids and keeps OIDC subjects", () => {
    expect(toUserDataSubClaim(UID, "acme-auth")).toBe(`acme-auth|${UID}`);
    expect(toUserDataSubClaim(`other-auth|${UID}`, "acme-auth")).toBe(
      `other-auth|${UID}`,
    );
    expect(toUserDataSubClaim("garbage", "acme-auth")).toBeNull();
  });

  test("uidFromUserDataSubClaim reads either form", () => {
    expect(uidFromUserDataSubClaim(UID)).toBe(UID);
    expect(uidFromUserDataSubClaim(`acme-auth|${UID}`)).toBe(UID);
    expect(uidFromUserDataSubClaim("acme-auth|nope")).toBeNull();
    expect(uidFromUserDataSubClaim(undefined)).toBeNull();
  });
});
