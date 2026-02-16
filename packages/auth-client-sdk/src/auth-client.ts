// auth-client.ts
// @schemavaults/auth-client-sdk

import {
  PKCE_ProofKeyManager,
  type CodeVerifierWithDetails,
  type CodeChallengeWithDetails,
  type UserData,
  type AccessToken,
  type RefreshToken,
  audienceSchema,
  type SuccessfullyGeneratedTokensRecord,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { IAuthClientConstructorOptions } from "@/types/IAuthClientConstructorOptions";
import { sendAuthenticateRequest } from "@/lib/send-authenticate-request";
import type { Credentials } from "@/types/credentials";
import type { ISchemaVaultsAuthClient } from "@/types/ISchemaVaultsAuthClient";
import type {
  AuthClientEvent,
  OnAuthStateChangedListenerRef,
} from "@/lib/auth-client-events";
import type { AcquireAccessTokenOptions } from "@/types/acquire-access-token-options";
import {
  type ApiServerId,
  type AppId,
  appIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import type { IAcquireAccessTokenFnOptions } from "@/lib/acquire-access-token";
import authenticateWithRedirect from "@/lib/authenticate-with-redirect";
import checkIfAuthenticatedWithServer from "@/lib/check-if-authenticated-with-server";
import exchangeAuthTokens from "@/lib/exchange-auth-tokens";
import handleSuccessfulAuthentication from "@/lib/handle-successful-authentication";
import handleSuccessfulExchangeAuthTokensResponse from "@/lib/handle-successful-exchange-auth-tokens-response";

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

  private get debug(): boolean {
    return this.DEBUG;
  }

  private readonly _default_audiences: readonly string[];

  private readonly _invite_code_required: boolean;

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

    // Should we require an invite code?
    this._invite_code_required =
      typeof opts.invite_code_required === "boolean"
        ? opts.invite_code_required
        : true;

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

  /**
   * @name handleAuthStateChange()
   * @description Loops over attached listeners and calls each one
   * @see this.listeners
   */
  private handleAuthStateChange(): void {
    if (this.DEBUG) {
      console.log("[handleAuthStateChange] Triggering listeners...");
    }
    for (const [listener_id, listener_ref] of this.listeners.entries()) {
      if (listener_id !== listener_ref.id) {
        throw new Error("[handleAuthStateChange] Listener ID mismatch");
      }
      try {
        if (this.debug) {
          console.log(
            `[handleAuthStateChange] Triggering listener with ID "${listener_id}"...`,
          );
        }
        listener_ref.listener();
      } catch (e: unknown) {
        console.error(
          `Error thrown from onAuthStateChange listener with ID "${listener_id}":`,
          e,
        );
        throw new Error(
          `[handleAuthStateChange] Error thrown from onAuthStateChange listener with ID "${listener_id}"`,
        );
      }
    }
  }

  /**
   * @name adapter
   * @description Returns the adapter instance used by the auth client.
   * @type ISchemaVaultsAuthClientAdapter
   */
  private get adapter(): ISchemaVaultsAuthClientAdapter {
    return this._adapter;
  }

  public get app_id(): AppId {
    if (!this._app_id || typeof this._app_id !== "string") {
      throw new Error(
        "Frontend client application ID not set for auth client!",
      );
    }
    return this._app_id satisfies string;
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

  private async authenticateWithRedirect(type: "login" | "register") {
    if (
      !this.authorize_uri ||
      typeof this.authorize_uri !== "string" ||
      this.authorize_uri.length === 0
    ) {
      throw new TypeError("Failed to resolve 'authorize_uri'!");
    }
    return await authenticateWithRedirect({
      type,
      adapter: this.adapter,
      auth_server_uri: this._authServerUri,
      client_app_id: this._app_id,
      storeCodeVerifier: this.storeCodeVerifier.bind(this),
      environment: this.environment,
      authorize_uri: this.authorize_uri,
      debug: this.debug,
    });
  }

  public async login(): Promise<void> {
    if (this.isClientForAuthServer) {
      return await this.adapter.redirect("/auth/login");
    }

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
  } // login()

  public async register(): Promise<void> {
    if (this.isClientForAuthServer) {
      return await this.adapter.redirect("/auth/register");
    }

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
  } // register()

  private triggerAuthStateChanged(): void {
    const eventType = "authStateChanged" as const satisfies AuthClientEvent;
    const changeEvent = new Event(eventType);
    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] triggerAuthStateChanged() - Dispatching event of type ${eventType}`,
      );
    }
    this.dispatchEvent(changeEvent);
  } // triggerAuthStateChanged()

  private storeMultipleAccessTokens(
    access_tokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">,
  ): void {
    const newAccessTokenAudiences: string[] = Object.keys(access_tokens);
    newAccessTokenAudiences.forEach((audience: string): void => {
      // store each access token
      const accessToken: AccessToken | "AS_HTTP_ONLY_COOKIE" | undefined =
        access_tokens[audience];
      if (!accessToken) {
        throw new TypeError(`Missing access token for audience "${audience}"`);
      }
      if (typeof accessToken === "object" && accessToken.type === "access") {
        if (audience !== accessToken.aud) {
          throw new Error(
            "Record key does not match access token audience field",
          );
        }
        this.storeAccessToken(audience, accessToken);
        return;
      } else if (
        typeof accessToken === "string" &&
        accessToken === "AS_HTTP_ONLY_COOKIE"
      ) {
        throw new Error(
          "Unimplemented; handling for HTTP-only Cookie Access Tokens is not implemented yet!",
        );
      } else {
        throw new TypeError(
          `Invalid access token type for audience "${audience}"`,
        );
      }
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
    const codeVerifiers: Record<number, string> =
      this.adapter.loadCodeVerifiers();
    return codeVerifiers;
  } // loadSavedAuthorizationCodeVerifiers()

  public async handleSuccessfulAuthentication(
    authorization_code: string,
    challenge_time: number,
    code_verifier?: string,
  ): Promise<void> {
    return await handleSuccessfulAuthentication({
      authorization_code,
      challenge_time,
      code_verifier,
      loadCodeVerifier: this.loadCodeVerifier.bind(this),
      auth_server_uri: this.auth_server_uri,
      client_app_id: this.app_id,
      adapter: this.adapter,
      storeUserData: this.storeUserData.bind(this),
      storeRefreshToken: this.storeRefreshToken.bind(this),
      storeMultipleAccessTokens: this.storeMultipleAccessTokens.bind(this),
      environment: this.environment,
      debug: this.DEBUG,
      triggerAuthStateChanged: this.triggerAuthStateChanged.bind(this),
      defaultTokenAudiences: this.defaultTokenAudiences,
    });
  } // handleSuccessfulAuthentication()

  public async logout(): Promise<void> {
    if (this.debug) {
      console.log("[SchemaVaultsAuthClient] logout()");
    }

    try {
      this.adapter.clearCodeVerifiers() satisfies void;
      (await this.adapter.clearAuthTokens()) satisfies void;
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
    return;
  } // logout()

  public hasHttpOnlyRefreshToken(): boolean {
    if (typeof this.adapter.doesSupportHttpOnlyRefreshToken !== "function") {
      return false;
    }
    if (!this.adapter.doesSupportHttpOnlyRefreshToken()) {
      return false;
    }
    if (typeof this.adapter.hasHttpOnlyRefreshToken !== "function") {
      return false;
    }
    if (this.adapter.hasHttpOnlyRefreshToken()) {
      return true;
    }
    return false;
  } // hasHttpOnlyRefreshToken()

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
    let uri: string | undefined = this._successful_authentication_redirect_uri;
    if (typeof uri !== "string" && typeof uri !== "undefined") {
      throw new Error("Unexpected data type for redirect uri");
    }

    if (!uri) {
      throw new Error("No successful authentication redirect URI set");
    }

    if (uri.startsWith("/")) {
      uri = this.adapter.relativeUrlToAbsoluteUrl(uri);
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

  /**
   * @name storeRefreshToken(refresh_token)
   * @param refresh_token A 'RefreshToken' object to be stored
   * @returns nothing, after storing the refresh token via the adapter
   */
  private storeRefreshToken(refresh_token: RefreshToken): void {
    if (typeof refresh_token !== "object" || refresh_token.type !== "refresh") {
      throw new TypeError(
        "Expected 'refresh_token' to be an object with 'type' set to 'refresh'",
      );
    }

    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] storeRefreshToken(${JSON.stringify(refresh_token)})`,
      );
    }
    this.adapter.storeRefreshToken(refresh_token);
    return;
  }

  /**
   * @name storeAccessToken(access_token)
   * @param token_id The ID of the access token to be stored
   * @param access_token An  'AccessToken' object to be stored
   * @returns nothing, after storing the access token via the adapter
   */
  private storeAccessToken(token_id: string, access_token: AccessToken): void {
    if (typeof token_id !== "string" || token_id.length === 0) {
      throw new TypeError("Expected 'token_id' to be a non-empty string");
    } else if (
      typeof access_token !== "object" ||
      access_token.type !== "access"
    ) {
      throw new TypeError(
        "Expected 'access_token' to be an object with 'type' set to 'access'",
      );
    }

    if (this.DEBUG) {
      console.log(
        `[SchemaVaultsAuthClient] storeAccessToken("${token_id}", ${JSON.stringify(access_token)})`,
      );
    }
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
    if (
      typeof this.adapter.doesSupportHttpOnlyRefreshToken === "function" &&
      this.adapter.doesSupportHttpOnlyRefreshToken()
    ) {
      throw new Error(
        "Cannot get refresh token from cache when using HTTP-only cookie storage",
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
   * @description Attempt to acquire an access token in order to communicate with a SchemaVaults resource server.
   * This will attempt to load a locally-saved refresh token in order to exchange it for an access token.
   * @see this.exchangeAuthTokens()
   */
  public async acquireAccessToken(
    opts: AcquireAccessTokenOptions,
  ): Promise<AccessToken> {
    let tradeRefreshTokenForAccessToken: (
      inputs: IAcquireAccessTokenFnOptions,
    ) => Promise<AccessToken>;
    try {
      tradeRefreshTokenForAccessToken = await import(
        "@/lib/acquire-access-token"
      ).then((mod) => mod.default);
      if (typeof tradeRefreshTokenForAccessToken !== "function") {
        throw new Error(
          "Expected default export from 'acquire-access-token' module to be a function!",
        );
      }
    } catch (error) {
      console.error(
        "[SchemaVaultsAuthClient] Failed to import acquire-access-token module:",
        error,
      );
      throw new Error("Failed to import 'acquire-access-token' module");
    }

    const adapter: ISchemaVaultsAuthClientAdapter = this.adapter;
    return await tradeRefreshTokenForAccessToken({
      opts,
      adapter,
      logout: this.logout.bind(this),
      exchangeAuthTokens: this.exchangeAuthTokens.bind(this),
      debug: this.debug,
    });
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
    return this.adapter.hasRefreshToken();
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
      invite_code_required: this._invite_code_required,
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
  ): Promise<SuccessfullyGeneratedTokensRecord> {
    return await handleSuccessfulExchangeAuthTokensResponse({
      tokens_response,
      storeMultipleAccessTokens: this.storeMultipleAccessTokens.bind(this),
      adapter: this.adapter,
      debug: this.debug,
    });
  }

  private async exchangeAuthTokens(
    refreshToken: RefreshToken | "AS_HTTP_ONLY_COOKIE",
    audience?: string | string[],
    replaceRefreshToo?: boolean,
  ): Promise<SuccessfullyGeneratedTokensRecord> {
    return await exchangeAuthTokens({
      refreshToken,
      replaceRefreshToo,
      audience: audience ?? this.defaultTokenAudiences,
      logout: this.logout.bind(this),
      debug: this.DEBUG,
      handleSuccessfulExchangeAuthTokensResponse:
        this.handleSuccessfulExchangeAuthTokensResponse.bind(this),
      client_app_id: this.app_id,
      adapter: this.adapter,
      auth_server_uri: this.auth_server_uri,
    });
  } // exchangeAuthTokens()

  private uuid(): string {
    let id: string;
    try {
      id = this.adapter.uuid();
    } catch (e: unknown) {
      console.error(
        "Failed to generate UUID using SchemaVaultsAuthClient platform adapter: ",
        e,
      );
      throw new Error(
        "Failed to generate UUID using SchemaVaultsAuthClient platform adapter!",
      );
    }
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError("Invalid UUID generated!");
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

  public supports(feature_name: string): boolean {
    if (feature_name === "http-only-refresh-token") {
      return (
        typeof this.adapter.doesSupportHttpOnlyRefreshToken === "function" &&
        this.adapter.doesSupportHttpOnlyRefreshToken()
      );
    }

    return false;
  }

  public async checkIfAuthenticatedWithServer(): Promise<UserData | null> {
    return await checkIfAuthenticatedWithServer({
      adapter: this.adapter,
      auth_server_uri: this.auth_server_uri,
      client_app_id: this.app_id,
    });
  }

  public async sendAuthorizeClientApplicationRequest(
    app_id: AppId,
  ): Promise<void> {
    const sendAuthorizeRequest = await import(
      "@/lib/send-authorize-client-application-request"
    ).then((mod) => mod.default);
    return await sendAuthorizeRequest({ app_id, adapter: this.adapter });
  }

  public async checkAppAuthorization(app_id: AppId): Promise<boolean> {
    const checkAuth = await import(
      "@/lib/check-app-authorization"
    ).then((mod) => mod.default);
    return await checkAuth({ app_id, adapter: this.adapter });
  }
}
