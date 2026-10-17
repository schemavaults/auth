import { describe, expect, test } from "bun:test";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { MaximumBrowserCookieSize, type UserData } from "@schemavaults/auth-common";
import { generateNewJwtKeySet, JWT_Factory } from "@schemavaults/jwt";
import {
  MAX_SUBJECT_TOKEN_LENGTH,
  parseSubjectTokenHeader,
} from "./subject-token-header";

const environment: SchemaVaultsAppEnvironment = "test";
const API_SERVER_ID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** A compact JWE-shaped string with the given protected header (the other segments are filler). */
function jweShaped(header: unknown, segmentCount = 5): string {
  const encodedHeader = typeof header === "string" ? header : b64url(JSON.stringify(header));
  return [encodedHeader, ...Array.from({ length: segmentCount - 1 }, () => "AAAA")].join(".");
}

const PLATFORM_HEADER = {
  alg: "RSA-OAEP-256",
  enc: "A256GCM",
  keyset_id: "11111111-1111-4111-8111-111111111111",
  kid: "11111111-1111-4111-8111-111111111111-decryption",
  aud: API_SERVER_ID,
} as const;

async function mintAccessToken(): Promise<string> {
  const uid = crypto.randomUUID();
  const user: UserData = {
    uid,
    sub: uid,
    email: "subject-token@example.com",
    email_verified: true,
    created_at: Date.now(),
    admin: false,
    disabled: false,
  };
  const jwt_keys = await generateNewJwtKeySet({ audience_id: API_SERVER_ID, environment });
  const factory = new JWT_Factory({
    user,
    client_app_id: "schemavaults-auth",
    jwt_keys,
    environment,
    user_organizations: [],
  });
  return (await factory.access(API_SERVER_ID)).token;
}

describe("parseSubjectTokenHeader", () => {
  test("reports an absent header", () => {
    expect(parseSubjectTokenHeader(undefined)).toEqual({ kind: "absent" });
    expect(parseSubjectTokenHeader(null)).toEqual({ kind: "absent" });
  });

  test("accepts a genuine platform access token unchanged", async () => {
    const token = await mintAccessToken();
    expect(parseSubjectTokenHeader(token)).toEqual({ kind: "token", token });
  });

  test("accepts a JWE-shaped value with the platform's header members", () => {
    const token = jweShaped(PLATFORM_HEADER);
    expect(parseSubjectTokenHeader(token)).toEqual({ kind: "token", token });
  });

  test("refuses empty and oversized values", () => {
    expect(parseSubjectTokenHeader("").kind).toBe("malformed");
    expect(MAX_SUBJECT_TOKEN_LENGTH).toBe(MaximumBrowserCookieSize);
    const oversized = `${jweShaped(PLATFORM_HEADER)}${"A".repeat(MAX_SUBJECT_TOKEN_LENGTH)}`;
    expect(parseSubjectTokenHeader(oversized)).toMatchObject({
      kind: "malformed",
      reason: expect.stringContaining("longer than"),
    });
  });

  test("refuses anything that is not a five-segment base64url compact serialization", () => {
    for (const value of [
      "not-a-token",
      "Bearer abc.def.ghi.jkl.mno",
      jweShaped(PLATFORM_HEADER, 3), // a JWS (e.g. an id_token or a JWKS access assertion)
      jweShaped(PLATFORM_HEADER, 6),
      `${jweShaped(PLATFORM_HEADER)} `,
      ` ${jweShaped(PLATFORM_HEADER)}`,
      jweShaped(PLATFORM_HEADER).replace(".AAAA.", ".."), // an empty segment
      jweShaped(PLATFORM_HEADER).replace("AAAA", "AA+A"), // base64, not base64url
    ]) {
      expect(parseSubjectTokenHeader(value), value).toMatchObject({
        kind: "malformed",
        reason: expect.stringContaining("compact serialization"),
      });
    }
  });

  test("refuses a protected header that is not a JSON object", () => {
    expect(parseSubjectTokenHeader(jweShaped("bm90LWpzb24")).kind).toBe("malformed"); // "not-json"
    expect(parseSubjectTokenHeader(jweShaped(["alg"])).kind).toBe("malformed");
    expect(parseSubjectTokenHeader(jweShaped("bnVsbA")).kind).toBe("malformed"); // "null"
  });

  test("refuses a protected header without the platform's members", () => {
    expect(parseSubjectTokenHeader(jweShaped({ ...PLATFORM_HEADER, alg: "dir" }))).toMatchObject({
      kind: "malformed",
      reason: expect.stringContaining("RSA-OAEP-256"),
    });
    for (const member of ["enc", "keyset_id", "aud"] as const) {
      const { [member]: _omitted, ...rest } = PLATFORM_HEADER;
      void _omitted;
      expect(parseSubjectTokenHeader(jweShaped(rest)), member).toMatchObject({
        kind: "malformed",
        reason: expect.stringContaining(`'${member}'`),
      });
      expect(parseSubjectTokenHeader(jweShaped({ ...PLATFORM_HEADER, [member]: "" })).kind).toBe("malformed");
    }
  });
});
