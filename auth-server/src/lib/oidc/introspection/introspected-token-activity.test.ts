import { describe, expect, test } from "bun:test";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import {
  evaluateIntrospectedTokenActivity,
  type IntrospectedTokenActivitySignals,
} from "./introspected-token-activity";
import type { OidcIntrospectionCaller } from "./types";

const AUTH_SERVER_APP_ID = "schemavaults-auth" as const;
const AUTH_SERVER_URL = "https://auth.example.test" as const;
const CLIENT_APP_ID = "22222222-2222-4222-8222-222222222222" as const;
const API_SERVER_ID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;
const UID = "44444444-4444-4444-8444-444444444444" as const;
/** The uid of the auth server's internally minted superuser token. */
const INTERNAL_SUPERUSER_UID = "00000000-0000-0000-0000-000000000000" as const;
const JTI = "55555555-5555-4555-8555-555555555555" as const;
const IAT = 1_700_000_000;

const apiServer: OidcIntrospectionCaller = {
  kind: "api_server",
  api_server_id: API_SERVER_ID,
};
const clientApp: OidcIntrospectionCaller = {
  kind: "client_app",
  client_app_id: CLIENT_APP_ID,
};

function accessToken(
  overrides: Partial<CustomJWTPayload> = {},
): CustomJWTPayload {
  return {
    uid: UID,
    sub: UID,
    email: "user@example.test",
    email_verified: true,
    aud: API_SERVER_ID,
    app: CLIENT_APP_ID,
    admin: false,
    disabled: false,
    created_at: 1_600_000_000_000,
    sig: "x".repeat(64),
    iss: AUTH_SERVER_URL,
    env: "test",
    iat: IAT,
    jti: JTI,
    ...overrides,
  };
}

/** The token `spoofSuperuserAccessToken` mints for the mail server. */
function internalSuperuserToken(
  overrides: Partial<CustomJWTPayload> = {},
): CustomJWTPayload {
  return accessToken({
    uid: INTERNAL_SUPERUSER_UID,
    sub: INTERNAL_SUPERUSER_UID,
    app: AUTH_SERVER_APP_ID,
    admin: true,
    ...overrides,
  });
}

interface SignalState {
  revokedJtis?: readonly string[];
  tokensValidAfter?: number;
  /** Client apps the user has authorized (the auth server's app always is). */
  authorizedApps?: readonly AppId[];
  /** `[app_id, api_server_id]` pairs with an app-to-API connection. */
  connections?: readonly (readonly [AppId, ApiServerId])[];
}

interface RecordedSignals extends IntrospectedTokenActivitySignals {
  calls: string[];
}

function signals(state: SignalState = {}): RecordedSignals {
  const calls: string[] = [];
  return {
    calls,
    isJtiRevoked: async (jti) => {
      calls.push("isJtiRevoked");
      return (state.revokedJtis ?? []).includes(jti);
    },
    getTokensValidAfter: async () => {
      calls.push("getTokensValidAfter");
      return state.tokensValidAfter ?? 0;
    },
    isAppAuthorizedForUser: async (_uid, app_id) => {
      calls.push("isAppAuthorizedForUser");
      return (
        app_id === AUTH_SERVER_APP_ID ||
        (state.authorizedApps ?? [CLIENT_APP_ID]).includes(app_id)
      );
    },
    isClientAppPermittedForApiServer: async (app_id, api_server_id) => {
      calls.push("isClientAppPermittedForApiServer");
      // Mirrors SchemaVaultsAppToApiPermissionsRegistry: the auth server's
      // own app is never connected to an API server.
      if (app_id === AUTH_SERVER_APP_ID) return false;
      return (state.connections ?? []).some(
        ([app, api]) => app === app_id && api === api_server_id,
      );
    },
  };
}

function evaluate(
  payload: CustomJWTPayload,
  caller: OidcIntrospectionCaller,
  state?: SignalState,
): Promise<boolean> {
  return evaluateIntrospectedTokenActivity({
    payload,
    caller,
    signals: signals(state),
    auth_server_app_id: AUTH_SERVER_APP_ID,
  });
}

describe("evaluateIntrospectedTokenActivity", () => {
  describe("a third-party client app's token introspected by an API server", () => {
    const connected: SignalState = {
      connections: [[CLIENT_APP_ID, API_SERVER_ID]],
    };

    test("is active while the app is connected to the API server", async () => {
      expect(await evaluate(accessToken(), apiServer, connected)).toBe(true);
    });

    test("is inactive once the app is disconnected from the API server", async () => {
      expect(await evaluate(accessToken(), apiServer, { connections: [] })).toBe(
        false,
      );
    });

    test("is inactive once the user de-authorizes the app", async () => {
      expect(
        await evaluate(accessToken(), apiServer, {
          ...connected,
          authorizedApps: [],
        }),
      ).toBe(false);
    });

    test("is inactive once its jti is revoked", async () => {
      expect(
        await evaluate(accessToken(), apiServer, {
          ...connected,
          revokedJtis: [JTI],
        }),
      ).toBe(false);
    });

    test("is inactive once it predates the user's tokens_valid_after watermark", async () => {
      expect(
        await evaluate(accessToken(), apiServer, {
          ...connected,
          tokensValidAfter: IAT + 1,
        }),
      ).toBe(false);
    });

    test("is inactive for a disabled account", async () => {
      expect(
        await evaluate(accessToken({ disabled: true }), apiServer, connected),
      ).toBe(false);
    });

    test("skips the jti check for a legacy token without one", async () => {
      const recorded = signals(connected);
      expect(
        await evaluateIntrospectedTokenActivity({
          payload: accessToken({ jti: undefined }),
          caller: apiServer,
          signals: recorded,
          auth_server_app_id: AUTH_SERVER_APP_ID,
        }),
      ).toBe(true);
      expect(recorded.calls).not.toContain("isJtiRevoked");
    });
  });

  describe("the auth server's own internally minted token introspected by an API server", () => {
    // The auth server mints these itself (spoofSuperuserAccessToken) to call
    // the mail server; its own app never has an app-to-API connection, so
    // the connection table must not decide their activity.
    test("is active without an app-to-API connection", async () => {
      expect(
        await evaluate(internalSuperuserToken(), apiServer, { connections: [] }),
      ).toBe(true);
    });

    test("does not consult the app-to-API connection at all", async () => {
      const recorded = signals({ connections: [] });
      await evaluateIntrospectedTokenActivity({
        payload: internalSuperuserToken(),
        caller: apiServer,
        signals: recorded,
        auth_server_app_id: AUTH_SERVER_APP_ID,
      });
      expect(recorded.calls).not.toContain("isClientAppPermittedForApiServer");
      expect(recorded.calls).toEqual([
        "isJtiRevoked",
        "getTokensValidAfter",
        "isAppAuthorizedForUser",
      ]);
    });

    test("is still inactive once its jti is revoked", async () => {
      expect(
        await evaluate(internalSuperuserToken(), apiServer, {
          revokedJtis: [JTI],
        }),
      ).toBe(false);
    });

    test("is still inactive once it predates the tokens_valid_after watermark", async () => {
      expect(
        await evaluate(internalSuperuserToken(), apiServer, {
          tokensValidAfter: IAT + 1,
        }),
      ).toBe(false);
    });

    test("is still inactive for a disabled account", async () => {
      expect(
        await evaluate(internalSuperuserToken({ disabled: true }), apiServer),
      ).toBe(false);
    });

    test("exempts only the configured auth server app id", async () => {
      // A white-label deployment names its auth server app differently; the
      // exemption follows the configured id, not the default.
      const WHITE_LABEL_AUTH_APP_ID = "acme-auth" as const;
      const recorded = signals({ connections: [] });
      expect(
        await evaluateIntrospectedTokenActivity({
          payload: internalSuperuserToken({ app: WHITE_LABEL_AUTH_APP_ID }),
          caller: apiServer,
          signals: {
            ...recorded,
            isAppAuthorizedForUser: async () => true,
          },
          auth_server_app_id: WHITE_LABEL_AUTH_APP_ID,
        }),
      ).toBe(true);
      // ...and a token of the default id is NOT exempt in that deployment.
      expect(
        await evaluateIntrospectedTokenActivity({
          payload: internalSuperuserToken(),
          caller: apiServer,
          signals: {
            ...signals({ connections: [] }),
            isAppAuthorizedForUser: async () => true,
          },
          auth_server_app_id: WHITE_LABEL_AUTH_APP_ID,
        }),
      ).toBe(false);
    });
  });

  describe("a token introspected by a confidential client app", () => {
    test("never consults the app-to-API connection", async () => {
      const recorded = signals({ connections: [] });
      expect(
        await evaluateIntrospectedTokenActivity({
          payload: accessToken({ aud: "oidc-userinfo" }),
          caller: clientApp,
          signals: recorded,
          auth_server_app_id: AUTH_SERVER_APP_ID,
        }),
      ).toBe(true);
      expect(recorded.calls).not.toContain("isClientAppPermittedForApiServer");
    });

    test("is inactive once the user de-authorizes the app", async () => {
      expect(
        await evaluate(accessToken({ aud: "oidc-userinfo" }), clientApp, {
          authorizedApps: [],
        }),
      ).toBe(false);
    });
  });
});
