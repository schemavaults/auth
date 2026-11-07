import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import { DEFAULT_AUTH_SCOPE } from "@schemavaults/auth-common";
import { SchemaVaultsAuthClient } from "@/auth-client";
import type { AuthorizationParams, SignInAuthorizationRequest } from "@/types/authorization-params";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

const APP_ORIGIN = "https://app.example.com";
const NOTES_SIGN_IN = {
  scope: "openid email profile notes:read notes:write",
  resource: "my-notes-api",
} as const satisfies AuthorizationParams;

interface ClientOptions {
  app_id?: string;
  authorization_params?: AuthorizationParams;
  /** false: an adapter predating sign-in request storage. */
  recordsSignIns?: boolean;
  signedIn?: boolean;
}

/** A client whose adapter keeps everything in memory. */
function createClient(options: ClientOptions = {}) {
  const redirects: string[] = [];
  const challenge_times: number[] = [];
  const flows = new Map<number, SignInAuthorizationRequest>();
  const state: { session: SignInAuthorizationRequest | null; signedIn: boolean } = {
    session: null,
    signedIn: options.signedIn ?? false,
  };
  const adapter = {
    redirect: (uri: string): void => {
      redirects.push(uri);
    },
    relativeUrlToAbsoluteUrl: (relative: string): string => new URL(relative, APP_ORIGIN).toString(),
    toBase64UrlFromBytes: (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url"),
    storeCodeVerifier: (_verifier: string, challenge_time: number): void => {
      challenge_times.push(challenge_time);
    },
    storeOAuth2State: (): void => {},
    storeOidcNonce: (): void => {},
    ...(options.recordsSignIns === false
      ? {}
      : {
          storeAuthorizationRequest: (request: SignInAuthorizationRequest, challenge_time: number): void => {
            flows.set(challenge_time, request);
          },
          loadAuthorizationRequest: (challenge_time: number) => flows.get(challenge_time) ?? null,
          clearAuthorizationRequest: (challenge_time: number): void => {
            flows.delete(challenge_time);
          },
          storeSessionAuthorizationRequest: (request: SignInAuthorizationRequest): void => {
            state.session = request;
          },
          loadSessionAuthorizationRequest: () => state.session,
          clearSessionAuthorizationRequest: (): void => {
            state.session = null;
          },
        }),
    clearCodeVerifiers: (): void => {},
    clearAuthTokens: async (): Promise<void> => {
      state.signedIn = false;
    },
    clearUserData: (): void => {},
    getUserData: () => null,
    hasRefreshToken: (): boolean => state.signedIn,
    getRefreshToken: () => null,
    uuid: (): string => crypto.randomUUID(),
  } as unknown as ISchemaVaultsAuthClientAdapter;

  const client = new SchemaVaultsAuthClient({
    adapter,
    auth_server_url: "https://auth.example.com",
    successful_authentication_redirect_uri: "/account",
    authorize_uri: "/auth/authorize",
    app_id: options.app_id ?? "my-web-app",
    app_env: "production",
    debug: false,
    disable_telemetry: true,
    ...(options.authorization_params ? { authorization_params: options.authorization_params } : {}),
  });

  /** What redeeming the code of the flow started at `challenge_time` records. */
  function completeSignIn(challenge_time: number): void {
    state.signedIn = true;
    (
      client as unknown as { recordSessionAuthorizationRequest(challenge_time: number): void }
    ).recordSessionAuthorizationRequest(challenge_time);
  }

  return { client, redirects, challenge_times, flows, state, completeSignIn };
}

function authorizeParams(redirect: string | undefined): URLSearchParams {
  if (!redirect) throw new Error("No redirect happened");
  return new URL(redirect).searchParams;
}

describe("authorization_params", () => {
  test("login() and register() ask for them when the call names no scope", async () => {
    const { client, redirects } = createClient({ authorization_params: NOTES_SIGN_IN });
    await client.login({ next_href: "/notes" });
    await client.register();
    for (const redirect of redirects) {
      expect(authorizeParams(redirect).get("scope")).toBe(NOTES_SIGN_IN.scope);
      expect(authorizeParams(redirect).get("resource")).toBe(NOTES_SIGN_IN.resource);
    }
    expect(redirects).toHaveLength(2);
  });

  test("a call's own scope and resource win, each on its own", async () => {
    const { client, redirects } = createClient({ authorization_params: NOTES_SIGN_IN });
    await client.login({ scope: "openid notes:admin" });
    await client.login({ scope: "openid billing:read", resource: "billing-api" });
    expect(authorizeParams(redirects[0]).get("scope")).toBe("openid notes:admin");
    expect(authorizeParams(redirects[0]).get("resource")).toBe("my-notes-api");
    expect(authorizeParams(redirects[1]).get("scope")).toBe("openid billing:read");
    expect(authorizeParams(redirects[1]).get("resource")).toBe("billing-api");
  });

  test("without them, sign-ins ask for the default scope and no resource", async () => {
    const { client, redirects } = createClient();
    await client.login();
    expect(authorizeParams(redirects[0]).get("scope")).toBe(DEFAULT_AUTH_SCOPE);
    expect(authorizeParams(redirects[0]).has("resource")).toBe(false);
  });

  test("refuses malformed ones at construction", () => {
    expect(() => createClient({ authorization_params: { scope: "openid notes:read" } })).toThrow(
      /no 'resource'/,
    );
  });

  test("each flow keeps what it asked for", async () => {
    const { client, challenge_times, flows } = createClient({ authorization_params: NOTES_SIGN_IN });
    await client.login();
    expect(flows.get(challenge_times[0]!)).toEqual(NOTES_SIGN_IN);
  });
});

describe("needsReauthorization()", () => {
  test("a session signed in with the authorization params does not need it", async () => {
    const { client, challenge_times, flows, state, completeSignIn } = createClient({
      authorization_params: NOTES_SIGN_IN,
    });
    await client.login();
    completeSignIn(challenge_times[0]!);
    expect(state.session).toEqual(NOTES_SIGN_IN);
    expect(flows.size).toBe(0);
    expect(client.needsReauthorization()).toBe(false);
  });

  test("a session signed in before them (unrecorded) needs it", () => {
    const { client } = createClient({ authorization_params: NOTES_SIGN_IN, signedIn: true });
    expect(client.needsReauthorization()).toBe(true);
  });

  test("a session whose sign-in asked for fewer scopes needs it", () => {
    const { client, state } = createClient({ authorization_params: NOTES_SIGN_IN, signedIn: true });
    state.session = { scope: "openid email profile notes:read", resource: "my-notes-api" };
    expect(client.needsReauthorization()).toBe(true);
  });

  test("a sign-in that asked for fewer scopes than now configured is recorded as such", async () => {
    const { client, challenge_times, state, completeSignIn } = createClient({
      authorization_params: NOTES_SIGN_IN,
    });
    await client.login({ scope: "openid notes:read" });
    completeSignIn(challenge_times[0]!);
    expect(state.session).toEqual({ scope: "openid notes:read", resource: "my-notes-api" });
    expect(client.needsReauthorization()).toBe(true);
  });

  test("a flow with nothing on record leaves the session unrecorded", () => {
    const { client, state, completeSignIn } = createClient({ authorization_params: NOTES_SIGN_IN });
    state.session = NOTES_SIGN_IN;
    completeSignIn(Date.now());
    expect(state.session).toBeNull();
    expect(client.needsReauthorization()).toBe(true);
  });

  test("is false without authorization params, a session, or sign-in records", () => {
    expect(createClient({ signedIn: true }).client.needsReauthorization()).toBe(false);
    expect(createClient({ authorization_params: NOTES_SIGN_IN }).client.needsReauthorization()).toBe(
      false,
    );
    expect(
      createClient({
        authorization_params: NOTES_SIGN_IN,
        signedIn: true,
        recordsSignIns: false,
      }).client.needsReauthorization(),
    ).toBe(false);
  });

  test("is false on the auth server's own frontend", () => {
    const { client } = createClient({
      app_id: DEFAULT_AUTH_SERVER_APP_ID,
      authorization_params: NOTES_SIGN_IN,
      signedIn: true,
    });
    expect(client.needsReauthorization()).toBe(false);
  });

  test("logout() forgets the session's sign-in", async () => {
    const { client, state } = createClient({ authorization_params: NOTES_SIGN_IN, signedIn: true });
    state.session = NOTES_SIGN_IN;
    await client.logout();
    expect(state.session).toBeNull();
    expect(client.needsReauthorization()).toBe(false);
  });
});
