import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { createAudienceListSchema } from "./audience-schema";

const AUTH_SERVER_URL = "https://auth.example-white-label.com";
const AUTH_SERVER_APP_ID = "example-auth";
const ENVIRONMENT = "development" as const;
const OVERRIDES = {
  auth_server_url: AUTH_SERVER_URL,
  auth_server_app_id: AUTH_SERVER_APP_ID,
} as const;

describe("createAudienceListSchema", () => {
  const schema = createAudienceListSchema(z, ENVIRONMENT, OVERRIDES);

  test("accepts an empty array (call sites enforce non-emptiness)", () => {
    expect(schema.safeParse([]).success).toBe(true);
  });

  test("accepts a list of valid audiences", () => {
    expect(schema.safeParse(["some-api", AUTH_SERVER_URL]).success).toBe(true);
  });

  test("rejects a list containing an invalid audience", () => {
    expect(schema.safeParse(["not a valid audience ref!!"]).success).toBe(
      false,
    );
  });

  test("rejects a bare string", () => {
    expect(schema.safeParse("some-api").success).toBe(false);
  });

  test("rejects a list with more than 10 audiences", () => {
    const audiences = Array.from({ length: 11 }, (_, i) => `api-server-${i}`);
    expect(schema.safeParse(audiences).success).toBe(false);
  });

  test("rejects the auth server's own app id as an audience", () => {
    expect(schema.safeParse([AUTH_SERVER_APP_ID]).success).toBe(false);
  });
});
