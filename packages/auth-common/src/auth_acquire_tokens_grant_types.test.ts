import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  createAuthorizationCodePOSTBodySchema,
  createRefreshTokenPOSTBodySchema,
} from "./auth_acquire_tokens_grant_types";
import { createAudienceListSchema } from "./audience-schema";

const AUTH_SERVER_URL = "https://auth.example-white-label.com";
const AUTH_SERVER_APP_ID = "example-auth";
const ENVIRONMENT = "development" as const;
const OVERRIDES = {
  auth_server_url: AUTH_SERVER_URL,
  auth_server_app_id: AUTH_SERVER_APP_ID,
} as const;

function validAuthorizationCodeBody(audience: string | string[]) {
  return {
    grant_type: "authorization_code" as const,
    code: "a".repeat(64),
    code_verifier: "b".repeat(64),
    client_app_id: "example-client-app",
    audience,
    challenge_time: 1234567890,
    redirect_uri: "https://app.example.com/auth/callback",
  };
}

function validRefreshTokenBody(
  audience: string | string[],
  replaceRefreshToo?: boolean,
) {
  return {
    grant_type: "refresh_token" as const,
    client_app_id: "example-client-app",
    audience,
    ...(typeof replaceRefreshToo === "boolean" ? { replaceRefreshToo } : {}),
  };
}

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
});

describe("createAuthorizationCodePOSTBodySchema audience handling", () => {
  const schema = createAuthorizationCodePOSTBodySchema(
    z,
    ENVIRONMENT,
    OVERRIDES,
  );

  test("accepts a single api server id audience", () => {
    const parsed = schema.safeParse(
      validAuthorizationCodeBody("example-api-server"),
    );
    expect(parsed.success).toBe(true);
  });

  test("accepts a non-empty audience list", () => {
    const parsed = schema.safeParse(
      validAuthorizationCodeBody(["example-api-server"]),
    );
    expect(parsed.success).toBe(true);
  });

  test("accepts the configured auth server URL as an audience", () => {
    const parsed = schema.safeParse(
      validAuthorizationCodeBody([AUTH_SERVER_URL]),
    );
    expect(parsed.success).toBe(true);
  });

  test("accepts an empty audience list (client with no default audiences)", () => {
    const parsed = schema.safeParse(validAuthorizationCodeBody([]));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.audience).toEqual([]);
    }
  });

  test("still rejects the auth server's own app id as an audience", () => {
    const parsed = schema.safeParse(
      validAuthorizationCodeBody([AUTH_SERVER_APP_ID]),
    );
    expect(parsed.success).toBe(false);
  });

  test("still rejects a list containing an invalid audience", () => {
    const parsed = schema.safeParse(
      validAuthorizationCodeBody(["not a valid audience ref!!"]),
    );
    expect(parsed.success).toBe(false);
  });

  test("still rejects a missing audience field", () => {
    const body: Record<string, unknown> = validAuthorizationCodeBody([]);
    delete body.audience;
    expect(schema.safeParse(body).success).toBe(false);
  });
});

describe("createRefreshTokenPOSTBodySchema audience handling", () => {
  const schema = createRefreshTokenPOSTBodySchema(z, ENVIRONMENT, OVERRIDES);

  test("accepts a non-empty audience list", () => {
    const parsed = schema.safeParse(
      validRefreshTokenBody(["example-api-server"]),
    );
    expect(parsed.success).toBe(true);
  });

  test("accepts an empty audience list (rotation-only refresh)", () => {
    const parsed = schema.safeParse(validRefreshTokenBody([]));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.audience).toEqual([]);
    }
  });

  test("tolerates the deprecated replaceRefreshToo flag from older clients", () => {
    expect(
      schema.safeParse(validRefreshTokenBody(["example-api-server"], true))
        .success,
    ).toBe(true);
    expect(schema.safeParse(validRefreshTokenBody([], false)).success).toBe(
      true,
    );
  });

  test("still rejects a list containing an invalid audience", () => {
    const parsed = schema.safeParse(
      validRefreshTokenBody(["not a valid audience ref!!"]),
    );
    expect(parsed.success).toBe(false);
  });
});
