import { AuthenticateURLEncoder } from "@/lib/authenticate-url-encoder";
import {
  PKCE_ProofKeyManager,
  requestTokensResultSchema,
  type CodeVerifierWithDetails,
  type CodeChallengeWithDetails,
  type UserData,
  type AccessToken,
  type RefreshToken,
  authorizationCodePOSTbody,
  refreshTokenPOSTbody,
  type RequestTokensResult,
  audienceRefSchema,
  audienceSchema,
} from "@schemavaults/auth-common";
import type {
  IAuthClientPOSTResultType,
  ISchemaVaultsAuthClientAdapter,
} from "@/types/framework-adapter-interface";
import type { IAuthClientConstructorOptions } from "@/types/IAuthClientConstructorOptions";
import { sendAuthenticateRequest } from "@/lib/send-authenticate-request";
import type { Credentials } from "@/types/credentials";
import type { ISchemaVaultsAuthClient } from "@/types/ISchemaVaultsAuthClient";
import type {
  AuthClientEvent,
  OnAuthStateChangedListenerRef,
} from "@/lib/auth-client-events";
import type { AcquireAccessTokenOptions } from "@/types/acquire-access-token-options";
import { z } from "zod";
import {
  appIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import isPrivateBeta from "./lib/is-private-beta";

/**
 * The SchemaVaultsAuthClient is a client SDK for the SchemaVaults Auth Server
 * It is used to authenticate users, store tokens, and manage user data
 * @name SchemaVaultsAuthClient
 * @alias AuthClient
 * @author jalexw
 * @implements ISchemaVaultsAuthClient
 */
export class SchemaVaultsAuthClient
  extends EventTarget
  implements ISchemaVaultsAuthClient
{
  private readonly _adapter: ISchemaVaultsAuthClientAdapter;

  private readonly environment: SchemaVaultsAppEnvironment;

  // URL of @schemavaults/auth-server
  private readonly _authServerUri: string;

  // Where to send user once they are logged in & have acquired a refresh token
  private readonly _successful_authentication_redirect_uri: string | undefined;
  // Where to send the user after they log out
  private readonly _successful_logout_redirect_uri: string | undefined;
  // Where to send the user to trade an authorization code + code verifier for a refresh token
  private readonly _authorize_uri: string | undefined;

  private readonly _app_id: string; // Undefined on the auth-server, set from 3rd party client

  private listeners: Map<string, OnAuthStateChangedListenerRef> = new Map();

  private readonly DEBUG: boolean;

  private readonly _default_audiences: string[];

  // Initialize the auth client
  constructor(opts: IAuthClientConstructorOptions) {
    // Set up event emitter
    super();

    // First, parse the environment
    const parsed_app_env = schemaVaultsAppEnvironmentSchema.safeParse(
      opts.app_env,
    );
    if (!parsed_app_env.success) {
      console.error(parsed_app_env.error);
      throw new Error(
        "Invalid app environment option (`app_env`) for auth client to run in!",
      );
    } else {
      this.environment = parsed_app_env.data;
    }

    if (this.environment === "development") {
      console.log(
        "[SchemaVaultsAuthClient] Creating auth client; determining debug status for execution...",
      );
    }

    if (typeof opts.debug === "boolean") {
      this.DEBUG = opts.debug;
    } else {
      // debug state was not explicitly supplied!
      if (
        this.environment === "development" ||
        this.environment === "test" ||
        this.environment === "staging"
      ) {
        this.DEBUG = true;
      } else if (isPrivateBeta()) {
        this.DEBUG = true;
      } else {
        this.DEBUG = false;
      }
    }

    if (this.DEBUG) {
      console.log("[SchemaVaultsAuthClient] Initializing with DEBUG = true!");
    }

    // Set up framework adapter
    this._adapter = opts.adapter;

    // Auth Server URI is a required prop
    if (typeof opts.auth_server_uri !== "string" || !opts.auth_server_uri) {
      throw new Error(
        "`auth_server_uri` is a required option to initalize the SchemaVaultsAuthClient",
      );
    }

    // Set up auth client options
    this._authServerUri = opts.auth_server_uri satisfies string;
    if (this.environment === "production" || this.environment === "staging") {
      // Ensure HTTPS
      if (!opts.auth_server_uri.startsWith("https://")) {
        throw new Error("Auth Server URI must use HTTPS in production!");
      }
    }

    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] auth_server_uri: '${this._authServerUri}'`,
      );
    }

    if (this.DEBUG) {
      let currentUrl: string | undefined = undefined;
      try {
        // @ts-expect-error Window is not defined in Node.js, this may not be in a browser environment
        if (typeof window === "object" && !!window) {
          // @ts-expect-error Window is not defined in Node.js, this may not be in a browser environment
          currentUrl = window.location.href;
        }
      } catch (e: unknown) {
        void e; /** no-op */
      }
      if (typeof currentUrl === "string") {
        // Successfully loaded current url
        console.log(
          `[SchemaVaultsAuthClient] Initializing auth client${
            typeof currentUrl === "string"
              ? ` (from current url: "${currentUrl}")`
              : ""
          } for auth server: `,
          this._authServerUri,
        );
      }
    }

    // Get frontend client app ID
    const parsed_app_id = appIdSchema.safeParse(opts.app_id);
    if (!parsed_app_id.success) {
      throw new Error(
        "Invalid app ID received for @schemavaults/auth-client-sdk initialization",
      );
    }
    this._app_id = parsed_app_id.data;
    console.assert(
      typeof this._app_id === "string",
      "App ID that this auth client is running for should be a string after being parsed!",
    );

    // Get redirect URLS (optional, non-web clients will not be redirected if not provided)
    this._successful_authentication_redirect_uri =
      opts.successful_authentication_redirect_uri;
    if (!this._successful_authentication_redirect_uri) {
      throw new Error(
        `'successful_authentication_redirect_uri' is required for PKCE login flow`,
      );
    }
    this._successful_logout_redirect_uri = opts.successful_logout_redirect_uri;

    if (
      typeof opts.authorize_uri !== "string" &&
      typeof opts.authorize_uri !== "undefined"
    ) {
      throw new Error(
        `Expected 'authorize_uri' to be a string or undefined, received type '${typeof opts.authorize_uri}'`,
      );
    }
    this._authorize_uri = opts.authorize_uri;

    // Get default audiences
    // E.g. the web app has https://api.schemavaults.com('s app ID) as an audience
    this._default_audiences = opts.default_audiences ?? [];

    // Set up auth state change listener
    this.addEventListener(
      "authStateChanged" as const satisfies AuthClientEvent,
      this.handleAuthStateChange.bind(this),
    );

    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] Successfully initialized! End of constructor()`,
      );
    }
  }

  private handleAuthStateChange(): void {
    if (this.DEBUG) {
      console.log("[handleAuthStateChange] Triggering listeners...");
    }
    this.listeners.forEach(
      (
        listener_ref: OnAuthStateChangedListenerRef,
        listener_id: string,
      ): void => {
        const { id, listener } = listener_ref;
        if (listener_id !== id)
          throw new Error("[handleAuthStateChange] Listener ID mismatch");
        try {
          if (
            this.environment === "development" ||
            this.environment === "test" ||
            this.environment === "staging"
          ) {
            console.log(
              `[handleAuthStateChange] Triggering listener with ID "${id}"...`,
            );
          }
          listener();
        } catch (e: unknown) {
          console.error(
            `Error thrown from onAuthStateChange listener with ID "${id}":`,
            e,
          );
          throw new Error(
            `[handleAuthStateChange] Error thrown from onAuthStateChange listener with ID "${id}"`,
          );
        }
      },
    );
  }

  private get adapter(): ISchemaVaultsAuthClientAdapter {
    return this._adapter;
  }

  public get app_id(): string {
    if (!this._app_id) {
      throw new Error(
        "Frontend client application ID not set for auth client!",
      );
    }
    return this._app_id;
  }

  // PKCE: Proof Key for Code Exchange
  // https://datatracker.ietf.org/doc/html/rfc7636
  // The client generates a code verifier and a code challenge
  // The code verifier is stored securely within the client
  // The code challenge is sent to the auth server
  // The auth server will hash the code challenge and compare it to the code verifier
  private storeCodeVerifier(
    code_verifier: string,
    challenge_time: number,
  ): void {
    // Store the code verifier in a secure location
    // This should be kept securely within the SDK
    // https://datatracker.ietf.org/doc/html/rfc7636#section-4.1

    const now = Date.now();
    if (!challenge_time || typeof challenge_time !== "number") {
      throw new Error("Invalid challenge_time; not a number");
    } else if (challenge_time > now) {
      throw new Error("Invalid challenge_time; in the future");
    }

    // Store within a cookie that can only be accessed by the SDK
    this.adapter.storeCodeVerifier(code_verifier, challenge_time);
    return;
  }

  // Load the code verifier from a secure location
  private loadCodeVerifier(challenge_time: number): string | null {
    const now = Date.now();
    if (!challenge_time || typeof challenge_time !== "number") {
      throw new Error("Invalid challenge_time; not a number");
    } else if (challenge_time > now) {
      throw new Error("Invalid challenge_time; in the future");
    } else if (now - challenge_time > PKCE_ProofKeyManager.max_age) {
      throw new Error("Code verifier has expired");
    }

    if (this.environment === "development") {
      console.log(
        "[SchemaVaultsAuthClient::loadCodeVerifier()] Loading code verifier...",
      );
    }

    const code_verifier = this.adapter.loadCodeVerifier(challenge_time);
    if (
      typeof code_verifier === "string" &&
      code_verifier.startsWith("deleted-at-")
    ) {
      throw new Error(
        "A code verifier with that challenge time has already been used & deleted!",
      );
    }

    if (this.environment === "development") {
      if (code_verifier) {
        console.log(
          "[SchemaVaultsAuthClient::loadCodeVerifier()] Loaded code verifier:",
          code_verifier,
        );
      } else {
        console.warn(
          "[SchemaVaultsAuthClient::loadCodeVerifier()] Failed to load code verifier!",
        );
      }
    }
    if (!code_verifier) return null;
    return code_verifier;
  }

  public async generateCodeChallenge(
    challenge_time: number = Date.now(),
  ): Promise<CodeChallengeWithDetails> {
    const code_verifier: CodeVerifierWithDetails =
      PKCE_ProofKeyManager.createCodeVerifier(challenge_time);
    const pkce = new PKCE_ProofKeyManager(code_verifier);
    const code_challenge = await pkce.getCodeChallenge();
    if (typeof code_challenge.challenge_time !== "number") {
      throw new Error(
        "Expected challenge_time to be set (from input code_verifier",
      );
    } else if (
      typeof code_challenge.code_challenge_method !== "string" ||
      code_challenge.code_challenge_method !== "S256"
    ) {
      throw new Error("Expected code_challenge_method to be set to S256");
    }
    code_challenge.code_challenge_method satisfies "S256";

    this.storeCodeVerifier(
      code_verifier.code_verifier satisfies string,
      code_challenge.challenge_time,
    );
    return code_challenge;
  }

  private async authenticateWithRedirect(
    type: "login" | "register",
  ): Promise<void> {
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] Authenticating with redirect (type "${type}")...`,
      );
    }

    // This should be kept securely within the SDK
    let code_verifier: CodeVerifierWithDetails;
    try {
      code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
    } catch (e: unknown) {
      console.error(
        "Failed to create code verifier to initialize PKCE challenge process: ",
        e,
      );
      throw new Error(
        "Failed to create code verifier to initialize PKCE challenge process",
      );
    }

    // Do some validation
    if (typeof code_verifier !== "object" || !code_verifier) {
      throw new TypeError(
        "Expected generated 'code_verifier' to be an object!",
      );
    } else if (typeof code_verifier.challenge_time !== "number") {
      throw new TypeError(
        "Expected generated 'code_verifier.challenge_time' to be a number!",
      );
    } else if (typeof code_verifier.code_verifier !== "string") {
      throw new TypeError(
        "Expected generated 'code_verifier.code_verifier' to be a string!",
      );
    }

    // This is sent to the auth server-- it's a hash of the code verifier
    // https://datatracker.ietf.org/doc/html/rfc7636#section-4.2
    let code_challenge: CodeChallengeWithDetails;
    try {
      const new_code_challenge: CodeChallengeWithDetails =
        await PKCE_ProofKeyManager.createCodeChallenge(code_verifier);
      code_challenge = new_code_challenge;
    } catch (e: unknown) {
      console.error(
        "Auth client failed to create code challenge from code verifier object: ",
        e,
      );
      const errMsg: string =
        e instanceof Error && typeof e.message === "string"
          ? e.message
          : "Auth client encountered an unknown error while creating code challenge";
      throw new Error(
        `Auth client failed to create code challenge from code verifier object (error: ${errMsg})`,
      );
    }

    // Validate code challenge a bit
    if (typeof code_challenge.challenge_time !== "number") {
      throw new Error(
        "Expected challenge_time to be set (from input code_verifier)",
      );
    } else if (
      typeof code_challenge.code_challenge_method !== "string" ||
      code_challenge.code_challenge_method !== "S256"
    ) {
      throw new Error("Expected code_challenge_method to be set to S256");
    } else if (typeof code_challenge.code_challenge !== "string") {
      throw new Error("Expected code_challenge to be set");
    }

    // Store the code verifier in a secure location
    try {
      this.storeCodeVerifier(
        code_verifier.code_verifier,
        code_challenge.challenge_time,
      ) satisfies void;
    } catch (e: unknown) {
      console.error("Failed to store code verifier: ", e);
      throw new Error("Failed to store code verifier!");
    }
    // If the authentication is successful, the auth server will redirect the user back to the client
    // and the code_verifier will be used to prove that the client initiating the flow is the same as the client that the authorization server issued the code to

    const app_id = this.app_id;
    if (!app_id) {
      console.error("App ID not set, but required for PKCE flow");
      throw new Error("App ID not set, but required for PKCE flow");
    }

    // The user is about to be redirected to auth server. Where should they be redirected back to this app? (for PKCE flow)
    const redirect_uri = this.authorize_uri satisfies string | undefined;
    if (typeof redirect_uri !== "string") {
      throw new Error(
        "A URL to redirect to when authentication is successful was not provided. Required for PKCE flow.",
      );
    }

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Attempting to build URL to open from client in order to start OAuth 2.0 PKCE flow with SchemaVaults Auth Server...",
      );
    }

    // Redirect the user to the auth server
    let authenticate_url: string;
    try {
      authenticate_url = AuthenticateURLEncoder.encode({
        type,
        code_challenge: code_challenge,
        redirect_uri,
        app_id,
        auth_server_uri: this._authServerUri,
        app_env: this.environment,
      });
    } catch (e: unknown) {
      console.error("Failed to build authenticate URL: ", e);
      throw new Error(
        "Failed to build authenticate URL (i.e. where to login/register url not found)",
      );
    }

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Redirecting to authenticate URL: ",
        authenticate_url,
      );
    }

    try {
      await this.adapter.redirect(authenticate_url);
      return;
    } catch (e: unknown) {
      console.error(
        "Failed to redirect to authentication server using client adapter: ",
        e,
      );
      throw new Error("Failed to redirect to authentication server");
    }
  }

  public async login() {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Attempting to sign in with redirect...",
      );
    }
    try {
      return await this.authenticateWithRedirect("login");
    } catch (e: unknown) {
      console.error("Failed to authenticate with redirect to login: ", e);
      if (e instanceof Error) throw e;
      throw new Error("Failed to authenticate with redirect to login!");
    }
  }

  public async register() {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Attempting to register with redirect...",
      );
    }
    try {
      return await this.authenticateWithRedirect("register");
    } catch (e: unknown) {
      console.error("Failed to authenticate with redirect to register: ", e);
      if (e instanceof Error) throw e;
      throw new Error("Failed to authenticate with redirect to register!");
    }
  }

  private triggerAuthStateChanged(): void {
    const eventType = "authStateChanged" as const satisfies AuthClientEvent;
    const changeEvent = new Event(eventType);
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] triggerAuthStateChanged() - Dispatching event of type ${eventType}`,
      );
    }
    this.dispatchEvent(changeEvent);
  }

  private storeMultipleAccessTokens(
    access_tokens: Record<string, AccessToken>,
  ): void {
    const newAccessTokenAudiences: string[] = Object.keys(access_tokens);
    newAccessTokenAudiences.forEach((audience: string): void => {
      // store each access token
      const accessToken: AccessToken | undefined = access_tokens[audience];
      if (!accessToken)
        throw new Error(`Missing access token for audience "${audience}"`);
      if (audience !== accessToken.aud)
        throw new Error(
          "Record key does not match access token audience field",
        );
      this.storeAccessToken(audience, accessToken);
    });
  }

  /**
   * @name isClientForAuthServer
   * @description Determines whether this client is running on the frontend of the authentication server app
   * (only the auth server can acquire access tokens for the auth server apis, as a security feature)
   */
  private get isClientForAuthServer(): boolean {
    if (this.app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      return true;
    }
    return false;
  }

  private get defaultTokenAudiences(): string | string[] {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Loading default token audiences...",
      );
    }

    let defaults: string[] = [];

    if (this.isClientForAuthServer) {
      defaults.push(SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id);
    }

    defaults.push(...this._default_audiences);

    if (defaults.length === 0) {
      console.warn(
        "[SchemaVaultsAuthClient] No default token audiences set for auth client!",
      );
      return [];
    }

    const parsed = audienceSchema.safeParse(
      defaults.length === 1 ? defaults[0] : defaults,
    );
    if (!parsed.success) {
      console.error(
        "Failed to validate list of token audiences: ",
        parsed.error,
      );
      throw new Error(
        "Failed to acquire list of default token audiences. You want to acquire access tokens without sending them anywhere? Get out of here goofball",
      );
    }

    const output = parsed.data;

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Loaded default token audiences:",
        output,
      );
    }

    return output;
  }

  public async loadSavedAuthorizationCodeVerifiers(): Promise<
    Record<number, string>
  > {
    const codeVerifiers = await this.adapter.loadCodeVerifiers();
    return codeVerifiers;
  }

  public async handleSuccessfulAuthentication(
    authorization_code: string,
    challenge_time: number,
    code_verifier?: string,
  ): Promise<void> {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication]" +
          " " +
          "Handling successful authentication...",
      );
    }

    if (!authorization_code) {
      throw new Error("Missing authorization code");
    }

    if (!challenge_time || typeof challenge_time !== "number") {
      throw new Error("Invalid challenge_time");
    }

    const time_elapsed_since_challenge_time = Date.now() - challenge_time;
    if (time_elapsed_since_challenge_time <= 0) {
      throw new Error("Expected challenge time to be in the past");
    }

    if (time_elapsed_since_challenge_time > PKCE_ProofKeyManager.max_age) {
      console.error(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication] Code verifier has expired based on challenge time",
      );
      if (this.environment === "development") {
        try {
          console.table({
            challenge_time,
            current_time: Date.now(),
            time_elapsed: time_elapsed_since_challenge_time,
            max_age: PKCE_ProofKeyManager.max_age,
          });
        } catch (e: unknown) {
          void e; /** no-op */
        }
      }
      throw new Error("Code verifier has expired");
    }

    // The auth server will redirect the user back to the client
    // The client will have a code in the query parameters
    // The client will use the code to get an access token
    // PKCE: The client will use the code_verifier to prove that it is the same client

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] " +
          "Attempting to load code verifier to prove authorization code validity...",
      );
    }

    const cached_code_verifier: string | null =
      code_verifier ?? this.loadCodeVerifier(challenge_time);
    if (!cached_code_verifier) {
      const errorMessage: string = `[SchemaVaultsAuthClient] Failed to load code_verifier at challenge_time=${challenge_time}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    cached_code_verifier satisfies string;

    const shouldClearCodeVerifierAfterLoad: boolean =
      this.environment !== "development";

    if (shouldClearCodeVerifierAfterLoad) {
      // Clear the code verifier from storage
      try {
        if (this.DEBUG) {
          console.log(
            "[SchemaVaultsAuthClient] " +
              "Code verifier was retrieved from storage, now clearing code verifier at challenge time: ",
            challenge_time,
          );
        }
        this.adapter.clearCodeVerifier(challenge_time);
        if (this.DEBUG) {
          console.log(
            "[SchemaVaultsAuthClient] Cleared code verifiers from storage",
          );
        }
      } catch (e: unknown) {
        console.error(
          "[SchemaVaultsAuthClient] Failed to clear code verifiers: ",
          e,
        );
        if (this.DEBUG) {
          throw new Error("Failed to clear code verifiers");
        }
      }
    } else {
      if (this.DEBUG) {
        console.log(
          "[SchemaVaultsAuthClient] Not attempting to clear code verifiers in this app environment...",
        );
      }
    }

    // Get the endpoint to exchange the authorization code for an access token
    // https://datatracker.ietf.org/doc/html/rfc7636#section-4.5
    const token_endpoint =
      `${this.auth_server_uri}/api/token/authorization_code` as const;
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Token Endpoint: ",
        token_endpoint,
      );
    }

    const client_app_id: string = this.app_id;
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Client App ID: ",
        client_app_id,
      );
    }

    let audience: string | string[] = this.defaultTokenAudiences;
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Initial access token audience(s): ",
        audience,
      );
    }
    if (!audience || (Array.isArray(audience) && audience.length === 0)) {
      console.warn(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] No access token audience(s) set",
      );
      audience = [];
    }

    // Exchange the authorization code for an access token
    let request_body: z.infer<typeof authorizationCodePOSTbody>;
    try {
      const parsed = await authorizationCodePOSTbody.safeParseAsync({
        grant_type: "authorization_code" as const,
        code: authorization_code,
        code_verifier: cached_code_verifier,
        client_app_id,
        audience,
        challenge_time,
      } satisfies z.infer<typeof authorizationCodePOSTbody>);
      if (!parsed.success) throw parsed.error;
      request_body = parsed.data;
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to prepare request body for authorization grant request",
      );
    }

    // Send the request to the auth server
    // The auth server will hash the code_verifier and compare it to the code_challenge

    let response: IAuthClientPOSTResultType<object>;
    try {
      if (this.environment !== "production") {
        console.log(
          `[SchemaVaultsAuthClient] Exchanging authorization code for access token; sending req body to token endpoint: "${token_endpoint}"`,
          request_body,
        );
      }
      response = await this.adapter.sendPOSTRequest(
        token_endpoint,
        request_body,
        {}, // no headers
      );

      if (this.environment !== "production") {
        console.log(
          "[SchemaVaultsAuthClient] Received response in attempt to exchange authorization code for access token: ",
          response,
        );
      }
    } catch (e: unknown) {
      console.error(
        "Failed to exchange authorization code for access token:",
        e,
      );
      throw new Error("Failed to exchange authorization code for access token");
    }

    if (!response || !response.ok || response.status !== 200) {
      const errorMsg: string =
        "Failed to exchange authorization code for access token";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (this.environment !== "production") {
      console.log(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
          "Successfully exchanged authorization code for token(s)",
      );
    }

    let refresh_token: RefreshToken;
    let access_tokens: Record<string, AccessToken>;
    let user: UserData;
    try {
      const tokens_data = await requestTokensResultSchema.safeParseAsync(
        response.data,
      );
      if (!tokens_data.success) {
        console.error(
          "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
            "Failed to parse tokens from auth server response:",
          tokens_data.error,
        );
        throw new Error("Failed to parse tokens from auth server response");
      } else if (!tokens_data.data.success) {
        throw new Error(tokens_data.data.message);
      }

      if (this.environment !== "production") {
        console.log(
          "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Success response data: ",
          tokens_data.data,
        );
      }

      const { tokens, userData } = tokens_data.data;
      if (!tokens) {
        console.error("Did not receive tokens in response from auth server");
        throw new Error("Did not receive tokens in response from auth server");
      } else if (!tokens.access) {
        console.error(
          "Did not receive any access tokens in response from auth server",
        );
        throw new Error(
          "Did not receive any access tokens in response from auth server",
        );
      } else if (!tokens.refresh) {
        console.error(
          "Did not receive refresh token in response from auth server",
        );
        throw new Error(
          "Did not receive refresh token in response from auth server",
        );
      }

      access_tokens = tokens.access;
      refresh_token = tokens.refresh;

      if (!userData) {
        console.error("Did not receive user data in response from auth server");
        throw new Error(
          "Did not receive user data in response from auth server",
        );
      }
      user = userData;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to parse tokens response");
    }

    if (this.environment === "development" || this.environment === "staging") {
      try {
        console.table({
          ...access_tokens,
          refresh_token,
        });
      } catch (e: unknown) {
        void e; /** no-op */
      }
      try {
        console.log("[SchemaVaultsAuthClient] User data:");
        console.table(user);
      } catch (e: unknown) {
        void e; /** no-op */
      }
    }

    // Store refresh tokens
    try {
      if (this.DEBUG) {
        console.log("[SchemaVaultsAuthClient] Storing refresh token...");
      }
      this.storeRefreshToken(refresh_token);
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to store refresh token");
    }
    if (this.DEBUG) {
      console.log("[SchemaVaultsAuthClient] Stored refresh token!");
    }

    // Store access tokens
    try {
      if (this.DEBUG) {
        console.log("[SchemaVaultsAuthClient] Storing access token(s)...");
      }
      this.storeMultipleAccessTokens(access_tokens);
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to store access tokens");
    }
    if (this.DEBUG) {
      console.log("[SchemaVaultsAuthClient] Stored access tokens!");
    }

    try {
      if (
        this.environment === "development" ||
        this.environment === "test" ||
        this.environment === "staging"
      ) {
        console.log("[SchemaVaultsAuthClient] Storing user data...");
      }
      this.storeUserData(user);
      if (
        this.environment === "development" ||
        this.environment === "test" ||
        this.environment === "staging"
      ) {
        console.log("[SchemaVaultsAuthClient] Stored user data.");
      }
    } catch (e: unknown) {
      console.error("Failed to store user data: ", e);
      throw new Error("Failed to store user data");
    }

    if (this.DEBUG) {
      console.log("[SchemaVaultsAuthClient] Triggering auth state changed!");
    }
    this.triggerAuthStateChanged();
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Finished triggering auth state change.",
      );
    }

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] handleSuccessfulAuthentication success!",
      );
    }
    return;
  }

  public async logout(): Promise<void> {
    if (this.environment !== "production") {
      console.log("[SchemaVaultsAuthClient] logout() running...");
    }

    try {
      this.adapter.clearCodeVerifiers() satisfies void;
      this.adapter.clearAuthTokens() satisfies void;
      this.adapter.clearUserData() satisfies void;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear local data for logout");
    }

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] logout() cleared local state, triggering auth state change event...",
      );
    }

    this.triggerAuthStateChanged();
  }

  public get auth_server_uri(): string {
    const host = this._authServerUri;
    if (this.secure && !host.startsWith("https://")) {
      throw new Error("Auth server host must use HTTPS");
    }
    return host;
  }

  public get secure(): boolean {
    const env = this.environment;
    if (env === "development" || env === "test") {
      return false;
    } else {
      // staging + prod use https
      return true;
    }
  }

  /**
   * @name successful_authentication_redirect_uri
   * @description Where to send the user after successful authentication
   * @example "For example, maybe send them to their account dashboard: `/account`."
   */
  public get successful_authentication_redirect_uri(): string {
    const uri = this._successful_authentication_redirect_uri;
    if (typeof uri !== "string" && typeof uri !== "undefined") {
      throw new Error("Unexpected data type for redirect uri");
    }

    if (!uri) {
      throw new Error("No successful authentication redirect URI set");
    }

    const app_env: SchemaVaultsAppEnvironment = this.environment;
    if (app_env !== "development" && app_env !== "test") {
      if (!uri.startsWith("https://")) {
        console.error(
          `Redirect URI must use HTTPS in production, received: "${uri}"`,
        );
        throw new Error(
          "Redirect URI must use HTTPS in production environments!",
        );
      }
    }

    return uri;
  }

  public get authorize_uri(): string | undefined {
    return this._authorize_uri;
  }

  private storeRefreshToken(refresh_token: RefreshToken): void {
    if (this.DEBUG)
      console.log(`Storing refresh token via adapter: `, refresh_token);
    this.adapter.storeRefreshToken(refresh_token);
    return;
  }

  private storeAccessToken(token_id: string, access_token: AccessToken): void {
    if (this.DEBUG)
      console.log(
        `Storing access token with ID "${token_id}" via adapter: `,
        access_token,
      );
    this.adapter.storeAccessToken(token_id, access_token);
    return;
  }

  public getAccessTokenFromCache(token_id: string): AccessToken | null {
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] Getting access token with ID "${token_id}" via adapter...`,
      );
    }
    const token: AccessToken | null = this.adapter.getAccessToken(token_id);
    if (this.DEBUG && !token) {
      console.warn(
        `[SchemaVaultsAuthClient] Cache lookup failed for access token with ID "${token_id}" via adapter...`,
      );
    }
    return token;
  }

  public getRefreshTokenFromCache(): RefreshToken | null {
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] Getting access token from cache via adapter...`,
      );
    }
    const token: RefreshToken | null = this.adapter.getRefreshToken();
    if (this.DEBUG && !token) {
      if (!token) {
        console.warn(
          "[SchemaVaultsAuthClient] Cache lookup failed for refresh token!",
        );
      } else {
        console.log(
          "[SchemaVaultsAuthClient] Cache lookup success for refresh token: ",
          token,
        );
      }
    }
    return token ?? null;
  }

  /**
   * @name acquireAccessToken
   * @description Attempt to acquire an access token in order to communicate with a SchemaVaults resource server
   */
  public async acquireAccessToken(
    opts: AcquireAccessTokenOptions,
  ): Promise<AccessToken> {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Attempting to acquire access token with opts: ",
        opts,
      );
    }

    if (!opts.ensure_fresh) {
      const cached = this.getAccessTokenFromCache(opts.token_id);
      if (cached) {
        if (cached.exp < Date.now() + 10 * 1000) {
          // Clear the access token from the cache
          try {
            this.adapter.clearAccessToken(opts.token_id);
          } catch (e: unknown) {
            console.error("Failed to clear access token from cache:", e);
          }
        } else {
          // Use access token if it doesn't expire in the next 10 seconds
          return cached;
        }
      }
      // Else, access token needs to be requested from server

      if (this.DEBUG) {
        console.warn(
          "[SchemaVaultsAuthClient] Access token not in cache, must attempt to get one from auth platform...",
        );
      }
    }

    let refresh_token: RefreshToken | null =
      opts.refresh_token ?? this.getRefreshTokenFromCache();
    if (!refresh_token) {
      if (this.DEBUG) {
        console.warn(
          "[SchemaVaultsAuthClient] Client is attempting to get an access token, but they don't have a refresh token...",
        );
      }
      throw new Error(
        "No refresh token available to exchange for access token!",
      );
    } else {
      if (this.DEBUG) {
        console.log(
          "[SchemaVaultsAuthClient] Found refresh token VIA auth client adapter to use in access-token-exchange: ",
          refresh_token,
        );
      }
    }
    console.assert(
      !!refresh_token,
      "Expected a refresh token to have been successfully retrieved if this point was reached!",
    );

    // where is this access token for? (e.g. auth server? registry? some other API server?)
    let audience: string;
    try {
      const parsed_audience = audienceRefSchema.safeParse(opts.audience);
      if (!parsed_audience.success) {
        console.error(
          "Failed to parse desired audience for access token load request: ",
          parsed_audience.error,
        );
        if (this.DEBUG) {
          console.error(
            "Error resulted from audience value of: ",
            opts.audience,
          );
        }
        throw parsed_audience.error;
      }
      audience = parsed_audience.data;
    } catch (e: unknown) {
      console.error(
        "Failed to parse 'audience' to request for new access token to exchange refresh token for: ",
        e,
      );
      throw new Error(
        "Failed to parse 'audience' to request for new access token to exchange refresh token for!",
      );
    }

    console.assert(
      typeof audience === "string",
      "Expected 'audience' to be a string if this point was reached!",
    );

    // refresh token => access token
    let tokens: (RequestTokensResult & { success: true })["tokens"];
    try {
      if (this.DEBUG) {
        console.log(
          `[SchemaVaultsAuthClient] Attempting to acquire access token of audience '${audience}' with refresh token: `,
          refresh_token,
        );
      }
      tokens = await this.exchangeAuthTokens(refresh_token, audience);
    } catch (e: unknown) {
      if (this.DEBUG) {
        console.error(
          `Failed to exchange refresh token for access token of audience: "${audience}": `,
          e,
        );
      }
      if (e instanceof Error) {
        const eMsg: string = e.message;
        if (
          eMsg.includes("token has expired") ||
          eMsg.includes("ERR_JWT_EXPIRED")
        ) {
          await this.logout();
          throw new Error(
            "Failed to exchange refresh token for access token; refresh token expired! We logged you out.",
          );
        }
      }

      throw new Error("Failed to exchange refresh token for access token");
    }

    const access_tokens = tokens?.access;
    if (!access_tokens)
      throw new Error(
        "No access tokens included in response from token acquisition endpoint",
      );

    const access = access_tokens[audience];
    if (!access)
      throw new Error(
        `No access token included with the audience originally requested: "${audience}"`,
      );

    if (!opts.dont_cache) {
      this.storeAccessToken(opts.token_id, access);
    }

    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] Acquired access token of audience '${audience}':`,
        access,
      );
    }

    return access;
  }

  private storeUserData(userData: UserData): void {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Attempting to cache user data VIA the platform adapter...",
      );
    }
    this.adapter.storeUserData(userData);
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Cached user data VIA the platform adapter.",
      );
    }
  }

  private getUserData(): UserData | null {
    if (this.DEBUG)
      console.log(
        "[SchemaVaultsAuthClient] Attempting to load cached user data VIA the platform adapter...",
      );

    let userData: UserData | null;
    try {
      userData = this.adapter.getUserData();
    } catch (e: unknown) {
      console.error(
        "Failed to use @schemavaults/auth-client-sdk platform adapter to load user data: ",
        e,
      );
      throw new Error(
        "Failed to load user data using @schemavaults/auth-client-sdk platform adapter",
      );
    }
    // note that user data can still be null/undefined here-- platform might be tryna say that there's no user data but no error

    if (this.DEBUG) {
      if (typeof userData === "object" && !!userData) {
        console.log(
          "[SchemaVaultsAuthClient] Successfully loaded user data VIA the platform adapter:",
          userData,
        );
      } else {
        // no user data, but not an error
        console.warn(
          "[SchemaVaultsAuthClient] Platform adapter returned no user data without indicating a failure-- user probably not logged in!",
        );
      }
    }

    return userData satisfies UserData | null;
  }

  protected getCurrentTimestamp(): number {
    return Date.now();
  }

  /**
   * @name isAuthenticated
   * @description Getter that returns true/false based on whether a user is currently signed into their account
   */
  public get isAuthenticated(): boolean {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient::isAuthenticated] Checking whether auth client has a refresh token to see if authenticated...",
      );
    }
    const refreshToken: RefreshToken | null = this.getRefreshTokenFromCache();
    if (refreshToken) {
      if (this.DEBUG) {
        console.log(
          "[SchemaVaultsAuthClient::isAuthenticated] There is a refresh token stored, checking if it is expired...",
        );
      }

      const refreshTokenExpiryTime: number = refreshToken.exp;
      const now = this.getCurrentTimestamp();
      if (now < refreshTokenExpiryTime) {
        return true;
      } else {
        if (this.DEBUG) {
          console.warn(
            "[SchemaVaultsAuthClient::isAuthenticated] There is a refresh token stored, but it appears to be expired!",
          );
        }
      }
    } else {
      if (this.DEBUG) {
        console.warn(
          "[SchemaVaultsAuthClient::isAuthenticated] No refresh token found from cache!",
        );
      }
    }

    return false;
  }

  /**
   * @name sendAuthenticateRequest
   * @description Send credentials to acquire an authorization code
   * @param authentication_type 'login' | 'register' | 'reset-password'
   * @param credentials Username/email/password/invite code
   * @param code_challenge A code challenge for Oauth2 PKCE flow. Allows ensuring that trading authorization code for refresh token is done by the client that initialized the attempt to acquire the authorization code!
   * @returns A 'string' authorization code, that can be exchanged for refresh/access JWTs (in combination with the code verifier-- which was used to generate the code challenge!)
   */
  public async sendAuthenticateRequest(
    authentication_type: AuthenticationOutcomeType,
    credentials: Credentials,
    code_challenge: CodeChallengeWithDetails,
  ): Promise<string> {
    if (this.DEBUG)
      console.log(
        "[SchemaVaultsAuthClient] Attempting to send authenticate request...",
      );
    return await sendAuthenticateRequest({
      adapter: this._adapter,
      authentication_type,
      credentials,
      code_challenge,
      app_environment: this.environment,
    });
  }

  /**
   * @name currentUser
   * @description If a user is signed in to this auth client and their user data is stored locally, return it. Else, returns null.
   * @returns `UserData` | `null`
   */
  public get currentUser(): UserData | null {
    const userData: UserData | null = this.getUserData();
    return userData;
  }

  private async handleSuccessfulExchangeAuthTokensResponse(
    tokens_response: unknown,
  ): Promise<(RequestTokensResult & { success: true })["tokens"] & object> {
    const parsed_tokens_data =
      await requestTokensResultSchema.safeParseAsync(tokens_response);
    if (!parsed_tokens_data.success) {
      if (this.DEBUG) {
        console.error(
          "[SchemaVaultsAuthClient::handleSuccessfulExchangeAuthTokensResponse()] " +
            "Failed to parse successful exchange auth tokens result: ",
          parsed_tokens_data.error.errors,
        );
      }
      throw new Error(
        "Failed to parse successful exchange auth tokens result!",
      );
    }

    const request_tokens_result: RequestTokensResult = parsed_tokens_data.data;

    if (!request_tokens_result.success) {
      throw new Error("Request tokens response has success === false");
    }

    const tokens = request_tokens_result.tokens;

    if (!tokens) {
      throw new Error("Response did not include any tokens");
    }

    if (!tokens.access) {
      throw new Error("No access token was included in the tokens response");
    }

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Successfully exchanged refresh token for new authentication token(s)",
      );
    }

    if (tokens.access) {
      this.storeMultipleAccessTokens(tokens.access);
    }

    if (tokens.refresh) {
      this.storeRefreshToken(tokens.refresh);
    }

    return tokens;
  }

  private async exchangeAuthTokens(
    refreshToken: RefreshToken | null,
    audience?: string | string[],
    replaceRefreshToo?: boolean,
  ): Promise<(RequestTokensResult & { success: true })["tokens"] & object> {
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] Attempting to send request to exchange refresh token for access token...",
      );
    }

    const token_endpoint =
      `${this.auth_server_uri}/api/token/refresh_token` as const;

    const client_app_id = this.app_id;

    if (!audience && !replaceRefreshToo) {
      throw new Error("Type of token to acquire not specified");
    }

    // Exchange the authorization code for an access token
    let request_body: z.infer<typeof refreshTokenPOSTbody>;
    try {
      const parsed = await refreshTokenPOSTbody.safeParseAsync({
        grant_type: "refresh_token" as const,
        client_app_id,
        audience: audience ?? this.defaultTokenAudiences,
        replaceRefreshToo: replaceRefreshToo ?? false,
      } satisfies z.infer<typeof refreshTokenPOSTbody>);
      if (!parsed.success) {
        console.error(parsed.error);
        throw new Error(
          "Failed to parse tokens from exchange auth tokens POST request!",
        );
      }
      request_body = parsed.data;
    } catch (e: unknown) {
      if (this.DEBUG) {
        console.error(
          "Failed to prepare request body for authorization grant request: ",
          e,
        );
      }
      throw new Error(
        "Failed to prepare request body for authorization grant request",
      );
    }

    const exchangeAuthTokensReqHeaders: Record<string, string> = {};

    if (refreshToken) {
      exchangeAuthTokensReqHeaders["Authorization"] =
        `Bearer ${refreshToken.token}`;
    }

    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient::exchangeAuthTokens()] " +
          `Sending POST request to "${token_endpoint}" with body & headers:`,
        request_body,
        exchangeAuthTokensReqHeaders,
      );
    }

    let tokens_response_data: RequestTokensResult;
    try {
      if (this.DEBUG) {
        console.log(`POST => ${token_endpoint}`);
      }

      const response = await this.adapter.sendPOSTRequest(
        token_endpoint,
        // body
        request_body,
        // headers
        exchangeAuthTokensReqHeaders,
      );
      if (
        !response ||
        typeof response !== "object" ||
        response.status !== 200
      ) {
        if (response.status === 403 || response.status === 401) {
          console.error(
            "401/403 error response from exchange token attempt, client is not logged in!",
          );
          await this.logout();
        }
        throw new Error(
          "HTTP request failed to exchange refresh token for access token(s) object",
        );
      }

      const parsed_failed_tokens_result =
        await requestTokensResultSchema.safeParseAsync(response.data);
      if (!parsed_failed_tokens_result.success) {
        console.error(
          "Failed to parse tokens response from server: ",
          parsed_failed_tokens_result.error,
        );
        throw new Error("Failed to parse tokens response from server!");
      }

      tokens_response_data = parsed_failed_tokens_result.data;
    } catch (e: unknown) {
      if (this.DEBUG) {
        console.error("[this.adapter.sendPOSTRequest] FAILED: ", e);
        throw new Error("Failed to ");
      }

      if (e instanceof Error) {
        const errMsg: string = e.message;
        const eMsg: string = errMsg.toLowerCase();
        if (
          eMsg.includes("expired") ||
          eMsg.includes("jwtexpired") ||
          eMsg.includes("err_jwt_expired")
        ) {
          console.error("Refresh token appears to have expired!");
          throw new Error("Refresh token has expired!");
        }
      }

      if (this.DEBUG) {
        console.error("Failed to exchange refresh token for access token: ", e);
      }
      throw new Error("Failed to exchange refresh token for access token");
    } // end of this.adapter.sendPOSTRequest catch block

    try {
      // Parse tokens from response JSON body
      return await this.handleSuccessfulExchangeAuthTokensResponse(
        tokens_response_data,
      );
    } catch (e: unknown) {
      if (this.DEBUG) {
        console.log("typeof e === ", typeof e);
        if (e instanceof Error) {
          console.error("Parse tokens error message: ", e.message);
        }
        console.error(
          "Failed to parse authentication tokens from exchange tokens POST request: ",
          e,
        );
      }
      throw new Error(
        "Failed to parse authentication tokens from exchange tokens POST request!",
      );
    }
  }

  private uuid(): string {
    let id: string;
    try {
      id = crypto.randomUUID();
    } catch (e: unknown) {
      console.warn("Failed to use crypto.randomUUID to generate an ID:", e);
      console.log("Trying to use adapter...");
      try {
        id = this.adapter.uuid();
      } catch (e: unknown) {
        console.error(
          "Failed to generate UUID using both crypto.randomUUID and platform adapter: ",
          e,
        );
        throw new Error(
          "Failed to generate UUID using both crypto.randomUUID and platform adapter! :(",
        );
      }
    }
    return id;
  }

  public onAuthStateChanged(
    listener: () => void,
    listener_id?: string,
  ): string {
    let id: string;
    if (!!listener_id && typeof listener_id === "string") {
      id = listener_id;
    } else {
      id = this.uuid();
    }

    if (typeof id !== "string") {
      throw new Error(
        "Failed to generate listener ID to initialize onAuthStateChanged listener with!",
      );
    }

    if (this.listeners.has(id)) {
      throw new Error(
        `An auth state listener callback already exists with ID: "${id}"`,
      );
    }
    this.listeners.set(id, {
      id,
      listener,
    });
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] onAuthStateChanged(listener, listener_id="${id}") -> Listener created!`,
      );
    }
    return id;
  }

  public removeAuthStateChangeListener(listener_id: string): void {
    if (!this.listeners.has(listener_id))
      throw new Error(`No auth state change listener with ID "${listener_id}"`);
    const removed_successfully: boolean = this.listeners.delete(listener_id);
    if (!removed_successfully) {
      console.error(
        `[SchemaVaultsAuthClient] removeAuthStateChangeListener(listener_id="${listener_id}") -> Failed to remove listener from map-- wrong ID or does not exist?.`,
      );
      throw new Error(
        `Failed to remove auth state change listener with ID "${listener_id}"`,
      );
    }
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] removeAuthStateChangeListener(listener_id="${listener_id}") -> Listener removed successfully!`,
      );
    }
    return;
  }

  /**
   * @name successful_logout_redirect_uri
   * @description Where to redirect after /auth/logout effect succeeds
   * @example "Perhaps the user should be sent back to the homepage: `/`"
   */
  public get successful_logout_redirect_uri(): string | undefined {
    const redirect_uri: string | undefined =
      this._successful_logout_redirect_uri ?? undefined;
    if (this.DEBUG) {
      console.log(
        "[SchemaVaultsAuthClient] successful_logout_redirect_uri: ",
        redirect_uri,
      );
    }
    return redirect_uri;
  }
}
