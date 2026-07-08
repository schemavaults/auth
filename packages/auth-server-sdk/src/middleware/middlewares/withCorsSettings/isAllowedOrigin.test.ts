import { describe, expect, test } from "bun:test";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import { isAllowedOrigin } from "./isAllowedOrigin";
import type { IAllowedOriginsResolver } from "./RemoteAllowedOriginsResolver";
import { SchemaVaultsCORSEnforcementPolicies as policies } from "./cors-policies";

const AUTH_SERVER_URL = "https://auth.example.com";
const API_SERVER_ID = "11111111-2222-3333-4444-555555555555";

class FakeAllowedOriginsResolver implements IAllowedOriginsResolver {
  public loadCallCount = 0;

  public constructor(
    private readonly origins: readonly string[] | Error,
    private readonly configured: boolean = true,
  ) {}

  public async loadAllowedOrigins(): Promise<readonly string[]> {
    this.loadCallCount++;
    if (this.origins instanceof Error) {
      throw this.origins;
    }
    return this.origins;
  }

  public isConfigured(): boolean {
    return this.configured;
  }
}

interface TestCaseOverrides {
  origin?: string | null;
  audience?: string;
  policy?: (typeof policies)[keyof typeof policies];
  allowed_origins_resolver?: IAllowedOriginsResolver;
}

function checkOrigin(overrides: TestCaseOverrides): Promise<boolean> {
  return isAllowedOrigin({
    origin: "https://app.example.com",
    policy: policies.EnforceValidAppIfOriginApplied,
    audience: API_SERVER_ID,
    environment: "test",
    auth_server_url: AUTH_SERVER_URL,
    ...overrides,
  });
}

describe("isAllowedOrigin", () => {
  describe("AllowAny policy", () => {
    test("allows an arbitrary origin", async () => {
      expect(
        await checkOrigin({
          policy: policies.AllowAny,
          origin: "https://anything.example.com",
        }),
      ).toBeTrue();
    });
  });

  describe("EnforceValidAppIfOriginApplied policy", () => {
    test("allows requests without an origin header", async () => {
      expect(await checkOrigin({ origin: null })).toBeTrue();
    });

    test("allows the auth server's own origin for the auth audience without a resolver lookup", async () => {
      const resolver = new FakeAllowedOriginsResolver([]);
      expect(
        await checkOrigin({
          origin: AUTH_SERVER_URL,
          audience: SCHEMAVAULTS_AUTH_APP_ID,
          allowed_origins_resolver: resolver,
        }),
      ).toBeTrue();
      expect(resolver.loadCallCount).toBe(0);
    });

    test("tolerates a trailing slash on the auth server's own origin", async () => {
      expect(
        await checkOrigin({
          origin: `${AUTH_SERVER_URL}/`,
          audience: SCHEMAVAULTS_AUTH_APP_ID,
        }),
      ).toBeTrue();
    });

    test("denies a foreign origin for the auth audience without a resolver lookup", async () => {
      const resolver = new FakeAllowedOriginsResolver([
        "https://app.example.com",
      ]);
      expect(
        await checkOrigin({
          origin: "https://app.example.com",
          audience: SCHEMAVAULTS_AUTH_APP_ID,
          allowed_origins_resolver: resolver,
        }),
      ).toBeFalse();
      expect(resolver.loadCallCount).toBe(0);
    });

    test("allows an origin in the resolved allowed-origins list", async () => {
      const resolver = new FakeAllowedOriginsResolver([
        "https://app.example.com",
      ]);
      expect(
        await checkOrigin({ allowed_origins_resolver: resolver }),
      ).toBeTrue();
      expect(resolver.loadCallCount).toBe(1);
    });

    test("tolerates a trailing slash when matching resolved origins", async () => {
      const resolver = new FakeAllowedOriginsResolver([
        "https://app.example.com",
      ]);
      expect(
        await checkOrigin({
          origin: "https://app.example.com/",
          allowed_origins_resolver: resolver,
        }),
      ).toBeTrue();
    });

    test("denies an origin missing from the resolved allowed-origins list", async () => {
      const resolver = new FakeAllowedOriginsResolver([
        "https://app.example.com",
      ]);
      expect(
        await checkOrigin({
          origin: "https://evil.example.com",
          allowed_origins_resolver: resolver,
        }),
      ).toBeFalse();
    });

    test("fails closed when the resolver throws", async () => {
      const resolver = new FakeAllowedOriginsResolver(
        new Error("auth server unreachable"),
      );
      expect(
        await checkOrigin({ allowed_origins_resolver: resolver }),
      ).toBeFalse();
    });

    test("fails closed when no resolver is provided", async () => {
      expect(await checkOrigin({})).toBeFalse();
    });

    test("fails closed when the resolver is not configured", async () => {
      const resolver = new FakeAllowedOriginsResolver(
        ["https://app.example.com"],
        false,
      );
      expect(
        await checkOrigin({ allowed_origins_resolver: resolver }),
      ).toBeFalse();
      expect(resolver.loadCallCount).toBe(0);
    });
  });

  describe("SameOriginIfOriginApplied policy", () => {
    test("allows requests without an origin header", async () => {
      expect(
        await checkOrigin({
          policy: policies.SameOriginIfOriginApplied,
          origin: null,
          audience: "https://api.example.com",
        }),
      ).toBeTrue();
    });

    test("allows a matching origin", async () => {
      expect(
        await checkOrigin({
          policy: policies.SameOriginIfOriginApplied,
          origin: "https://api.example.com",
          audience: "https://api.example.com",
        }),
      ).toBeTrue();
    });

    test("normalizes default ports when comparing", async () => {
      expect(
        await checkOrigin({
          policy: policies.SameOriginIfOriginApplied,
          origin: "https://api.example.com",
          audience: "https://api.example.com:443",
        }),
      ).toBeTrue();
    });

    test("denies a mismatched origin", async () => {
      expect(
        await checkOrigin({
          policy: policies.SameOriginIfOriginApplied,
          origin: "https://other.example.com",
          audience: "https://api.example.com",
        }),
      ).toBeFalse();
    });

    test("denies (without throwing) when the audience is not a URL", async () => {
      expect(
        await checkOrigin({
          policy: policies.SameOriginIfOriginApplied,
          origin: "https://app.example.com",
          audience: API_SERVER_ID,
        }),
      ).toBeFalse();
    });
  });
});
