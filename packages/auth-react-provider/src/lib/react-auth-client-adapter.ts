"use client";

import {
  type AppId,
  appIdSchema,
  getAuthServerUri,
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type AccessToken,
  AccessTokenCookieName,
  AccessTokenExpiryCookieName,
  PKCE_ProofKeyManager,
  type RefreshToken,
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
  type UserData,
  accessTokenDataSchema,
  refreshTokenDataSchema,
  userDataSchema,
} from "@schemavaults/auth-common";
import { type ISchemaVaultsAuthClientAdapter } from "@schemavaults/auth-client-sdk";
import {
  deleteCookie,
  getCookie,
  getCookies,
  setCookie,
} from "cookies-next/client";
import type { IReactAuthClientSdkAdapterInitOptions } from "@/types/IReactAuthClientSdkAdapterInitOptions";
import isClientRuntime from "@/lib/isClientRuntime";

const enum AuthClientSdkAdapterLocalStorageKeys {
  CODE_VERIFIERS = "code_verifiers",
  OAUTH2_STATES = "oauth2_states",
  USER_DATA = "user_data",
}

// Next.js/React.js to JS Client SDK Adapter
export class ReactAuthClientSdkAdapter
  implements ISchemaVaultsAuthClientAdapter
{
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;
  private readonly auth_server_uri: string;
  private readonly client_app_id: AppId;

  private readonly _fetch: (
    url: string,
    init: RequestInit | undefined,
  ) => Promise<Response>;

  public async fetch(
    url: string,
    init: RequestInit | undefined,
  ): Promise<Response> {
    const doFetch = this._fetch.bind(window);
    return await doFetch(url, init);
  }

  public constructor({
    uuid,
    environment,
    ...opts
  }: IReactAuthClientSdkAdapterInitOptions) {
    this.environment = environment;
    if (typeof opts.debug === "boolean") {
      this.debug = opts.debug;
    } else {
      this.debug = this.environment !== "production";
    }
    if (this.debug) {
      console.log(
        `[ReactAuthClientSdkAdapter] Initializing in environment: "${this.environment}"`,
      );
    }

    this._uuid_generator = uuid;
    this.auth_server_uri = opts.auth_server_uri
      ? opts.auth_server_uri
      : getAuthServerUri();
    if (!appIdSchema.safeParse(opts.client_app_id).success) {
      throw new TypeError(
        "Invalid 'client_app_id' to initialize ReactAuthClientSdkAdapter with!",
      );
    }
    this.client_app_id = opts.client_app_id;
    this._fetch = opts.fetch.bind(window);
  }

  private get ssl_enabled(): boolean {
    const environment: SchemaVaultsAppEnvironment = this.environment;
    if (environment === "development" || environment === "test") {
      return false;
    }
    return true;
  }

  private _uuid_generator: (() => string) | undefined = undefined;

  public uuid(): string {
    try {
      if (typeof this._uuid_generator === "function") {
        return this._uuid_generator() satisfies string;
      }

      return crypto.randomUUID();
    } catch (e: unknown) {
      console.error("Failed to generate UUID: ", e);
      throw new Error("Failed to generate UUID! Insecure HTTP context?");
    }
  }

  public redirect(uri: string): void {
    if (this.debug) {
      console.log(`[ReactAuthClientSdkAdapter] Redirecting to URI: ${uri}`);
    }
    try {
      window.location.href = uri;
    } catch (e: unknown) {
      console.error(
        `[ReactAuthClientSdkAdapter] Failed to redirect to URI: ${uri}`,
        e,
      );
    }
  }

  private clearCookie(key: string): void {
    if (this.debug) {
      console.log(
        `[ReactAuthClientSdkAdapter] Clearing cookie for key: ${key}`,
      );
    }
    try {
      deleteCookie(key);
    } catch (e) {
      console.error(e);
    }
  }

  public storeCodeVerifier(
    code_verifier: string,
    challenge_time: number,
  ): void {
    try {
      const code_verifiers_str = window.localStorage.getItem(
        AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
      );
      let code_verifiers: Record<number, string> = {};
      if (code_verifiers_str) {
        code_verifiers = JSON.parse(code_verifiers_str);
        if (!code_verifiers || typeof code_verifiers !== "object") {
          throw new Error("Invalid code_verifiers object in local storage");
        }
      }

      // Clear out expired code verifiers
      const now = Date.now();
      for (const challenge_time_key of Object.keys(code_verifiers)) {
        const challenge_time_int = parseInt(challenge_time_key);
        if (isNaN(challenge_time_int)) {
          throw new Error(
            "Invalid challenge_time key in code_verifiers object",
          );
        }
        if (now - challenge_time_int > PKCE_ProofKeyManager.max_age) {
          delete code_verifiers[challenge_time_int];
        }
      }

      code_verifiers[challenge_time] = code_verifier;

      window.localStorage.setItem(
        AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
        JSON.stringify(code_verifiers),
      );
      if (this.environment === "development") {
        console.log(
          `[ReactAuthClientSdkAdapter] Stored code verifier in local storage at t=${challenge_time}: ${code_verifier}`,
        );
      }
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        `Failed to store code verifier in local storage for challenge_time ${challenge_time}`,
      );
    }
  }

  public loadCodeVerifiers(): Record<number, string> {
    try {
      const code_verifiers_str = window.localStorage.getItem(
        AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
      );
      if (!code_verifiers_str) {
        return {};
      }
      const code_verifiers = JSON.parse(code_verifiers_str);
      if (!code_verifiers || typeof code_verifiers !== "object") {
        if (code_verifiers) {
          window.localStorage.removeItem(
            AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
          );
        }
        throw new Error("Code verifiers is not a valid JSON object");
      }
      for (const [key, value] of Object.entries(code_verifiers)) {
        if (typeof key !== "string" || isNaN(Number(key))) {
          throw new Error(
            "Invalid key in code_verifiers object; expected a string representing a number",
          );
        }
        if (typeof value !== "string") {
          throw new Error(
            "Invalid value in code_verifiers object; expected a string",
          );
        }
      }
      return code_verifiers;
    } catch (e: unknown) {
      console.error("Failed to load code verifiers: ", e);
      throw new Error("Failed to load code_verifiers!");
    }
  }

  public loadCodeVerifier(challenge_time: number): string | null {
    if (this.debug) {
      console.log(
        `[ReactAuthClientSdkAdapter::loadCodeVerifier()] Loading code verifier from local storage for challenge_time=${challenge_time}`,
      );
    }

    try {
      const code_verifiers = this.loadCodeVerifiers();
      if (!code_verifiers) {
        return null;
      } else if (typeof code_verifiers !== "object") {
        console.error("Invalid code_verifiers object in local storage");
        window.localStorage.removeItem(
          AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
        );
        return null;
      }
      const code_verifier = code_verifiers[challenge_time];
      if (typeof code_verifier !== "string") {
        throw new TypeError(
          "Invalid code verifier, code_verifiers object values should be strings." +
            " " +
            `Received a value of type: '${typeof code_verifier}'`,
        );
      }

      if (code_verifier.startsWith("deleted-at-")) {
        // careful changing this error message
        // "already been used" is used as a search substring in detecting whether code verifier already deleted
        throw new Error("Code verifier has already been used & deleted!");
      }

      if (this.debug) {
        console.log(
          `[ReactAuthClientSdkAdapter] Loaded code verifier from local storage for challenge_time=${challenge_time}: ${code_verifier}`,
        );
      }

      return code_verifier;
    } catch (e: unknown) {
      console.error("Failed to load code verifier from local storage: ", e);
      throw new Error("Failed to load code verifier from local storage");
    }
  }

  public clearCodeVerifier(challenge_time: number): void {
    if (this.debug) {
      console.log(
        "[ReactAuthClientSdkAdapter] Clearing code verifier from local storage at challenge time: ",
        challenge_time,
      );
    }
    try {
      const code_verifiers: Record<number, string> = this.loadCodeVerifiers();
      if (code_verifiers[challenge_time]) {
        code_verifiers[challenge_time] = `deleted-at-${Date.now()}`;
        window.localStorage.setItem(
          AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
          JSON.stringify(code_verifiers),
        );
        return;
      }
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear code verifiers from local storage");
    }
  }

  public clearCodeVerifiers(): void {
    if (this.debug) {
      console.log(
        "[ReactAuthClientSdkAdapter] Clearing code verifiers from local storage",
      );
    }
    try {
      window.localStorage.removeItem(
        AuthClientSdkAdapterLocalStorageKeys.CODE_VERIFIERS,
      );
      window.localStorage.removeItem(
        AuthClientSdkAdapterLocalStorageKeys.OAUTH2_STATES,
      );
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear code verifiers from local storage");
    }
  }

  private loadOAuth2States(): Record<number, string> {
    try {
      const raw = window.localStorage.getItem(
        AuthClientSdkAdapterLocalStorageKeys.OAUTH2_STATES,
      );
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        window.localStorage.removeItem(
          AuthClientSdkAdapterLocalStorageKeys.OAUTH2_STATES,
        );
        return {};
      }
      for (const [k, v] of Object.entries(parsed)) {
        if (isNaN(Number(k)) || typeof v !== "string") {
          window.localStorage.removeItem(
            AuthClientSdkAdapterLocalStorageKeys.OAUTH2_STATES,
          );
          return {};
        }
      }
      return parsed as Record<number, string>;
    } catch (e: unknown) {
      console.error("Failed to load OAuth2 states: ", e);
      return {};
    }
  }

  public storeOAuth2State(state: string, challenge_time: number): void {
    if (typeof state !== "string" || state.length === 0) {
      throw new TypeError(
        "Expected 'state' to be a non-empty string for OAuth2 state storage!",
      );
    }
    try {
      const states = this.loadOAuth2States();

      // Evict entries older than the PKCE challenge max-age so the
      // bag doesn't grow unboundedly across abandoned flows.
      const now = Date.now();
      for (const key of Object.keys(states)) {
        const t = parseInt(key);
        if (isNaN(t) || now - t > PKCE_ProofKeyManager.max_age) {
          delete states[t];
        }
      }

      states[challenge_time] = state;
      window.localStorage.setItem(
        AuthClientSdkAdapterLocalStorageKeys.OAUTH2_STATES,
        JSON.stringify(states),
      );
      if (this.environment === "development") {
        console.log(
          `[ReactAuthClientSdkAdapter] Stored OAuth2 state at t=${challenge_time}`,
        );
      }
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        `Failed to store OAuth2 state for challenge_time ${challenge_time}`,
      );
    }
  }

  public loadOAuth2State(challenge_time: number): string | null {
    try {
      const states = this.loadOAuth2States();
      const value = states[challenge_time];
      if (typeof value !== "string" || value.length === 0) return null;
      if (value.startsWith("deleted-at-")) {
        throw new Error("OAuth2 state has already been used & deleted!");
      }
      return value;
    } catch (e: unknown) {
      console.error(
        "[ReactAuthClientSdkAdapter] Failed to load OAuth2 state: ",
        e,
      );
      throw new Error("Failed to load OAuth2 state from local storage");
    }
  }

  public clearOAuth2State(challenge_time: number): void {
    try {
      const states = this.loadOAuth2States();
      if (typeof states[challenge_time] === "string") {
        states[challenge_time] = `deleted-at-${Date.now()}`;
        window.localStorage.setItem(
          AuthClientSdkAdapterLocalStorageKeys.OAUTH2_STATES,
          JSON.stringify(states),
        );
      }
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear OAuth2 state from local storage");
    }
  }

  private storeLocalStorageRefreshToken(refresh_token: RefreshToken): void {
    window.localStorage.setItem(
      RefreshTokenCookieName(this.client_app_id),
      JSON.stringify(refresh_token),
    );
    window.localStorage.setItem(
      RefreshTokenExpiryCookieName(this.client_app_id),
      `${refresh_token.exp}`,
    );
  }

  public storeRefreshToken(refresh_token: RefreshToken): void {
    if (this.doesSupportHttpOnlyRefreshToken()) {
      throw new Error(
        "Refresh tokens should be set by the server as HTTP-only cookies for web-based authentication.",
      );
    } else {
      return this.storeLocalStorageRefreshToken(refresh_token);
    }
  }

  public storeAccessToken(token_id: string, access_token: AccessToken): void {
    const cookie_options = {
      httpOnly: false,
      secure: this.ssl_enabled,
      sameSite: "lax" as const,
      expires: new Date(access_token.exp),
    };
    setCookie(
      AccessTokenCookieName(token_id),
      JSON.stringify(access_token),
      cookie_options,
    );
    setCookie(
      AccessTokenExpiryCookieName(token_id),
      String(access_token.exp),
      cookie_options,
    );
  }

  public getAccessToken(token_id: string): AccessToken | null {
    try {
      const cookie_value = getCookie(AccessTokenCookieName(token_id), {
        httpOnly: false,
        secure: this.ssl_enabled,
      });
      if (typeof cookie_value !== "string" || cookie_value.length === 0) {
        return null;
      }
      const json: unknown = JSON.parse(cookie_value);
      const parsed = accessTokenDataSchema.safeParse(json);
      if (!parsed.success) {
        console.error(parsed.error);
        throw new Error("Invalid access token data");
      }
      return parsed.data;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to get access token from cookie");
    }
  }

  private getLocalStorageRefreshToken(): RefreshToken | null {
    const refreshTokenJson: string | null = window.localStorage.getItem(
      RefreshTokenCookieName(this.client_app_id),
    );
    if (!refreshTokenJson) {
      return null;
    }
    const parsed_token = refreshTokenDataSchema.safeParse(
      JSON.parse(refreshTokenJson),
    );
    if (!parsed_token.success) {
      this.clearLocalStorageRefreshToken();
      return null;
    }
    const refreshToken: RefreshToken = parsed_token.data;
    const exp: number = refreshToken.exp;
    const expired: boolean = Date.now() >= exp;
    if (expired) {
      this.clearLocalStorageRefreshToken();
      return null;
    }
    return refreshToken;
  }

  public getRefreshToken(): RefreshToken | null {
    if (this.doesSupportHttpOnlyRefreshToken()) {
      throw new Error(
        "Refresh tokens should be set by the server as HTTP-only cookies for web-based authentication.",
      );
    } else {
      return this.getLocalStorageRefreshToken();
    }
  }

  public clearAccessTokens(): void {
    const all_cookies = getCookies();
    if (!all_cookies) {
      return;
    }
    for (const cookie_name of Object.keys(all_cookies)) {
      if (cookie_name.startsWith("access_token_")) {
        deleteCookie(cookie_name);
      }
    }
  }

  public async clearHttpOnlyRefreshToken(): Promise<void> {
    try {
      await this.fetch(
        `${this.auth_server_uri}/api/auth/logout/${this.client_app_id}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
    } catch (e: unknown) {
      console.error(
        "Failed to clear HTTP-only refresh token via network request to @schemavaults/auth-server: ",
        e,
      );
      throw new Error(
        "Failed to clear HTTP-only refresh token via network request to @schemavaults/auth-server",
      );
    }
    this.clearHttpOnlyRefreshTokenMarker();
    return;
  }

  public async clearAuthTokens(): Promise<void> {
    this.clearAccessTokens();
    if (this.doesSupportHttpOnlyRefreshToken()) {
      await this.clearHttpOnlyRefreshToken();
    } else {
      this.clearLocalStorageRefreshToken();
    }
    return;
  } // end of clearAuthTokens()

  public storeUserData(userData: UserData): void {
    const parsed = userDataSchema.safeParse(userData);
    if (!parsed.success) {
      console.error(
        "Invalid user data to store with ReactAuthClientSdkAdapter: ",
        parsed.error,
      );
      throw new Error(
        "Invalid user data to store with ReactAuthClientSdkAdapter!",
      );
    }
    const data: UserData = parsed.data;

    if (this.debug) {
      console.log("[ReactAuthClientSdkAdapter] storeUserData(", data, ")");
    }

    try {
      window.localStorage.setItem(
        AuthClientSdkAdapterLocalStorageKeys.USER_DATA,
        JSON.stringify(userData),
      );
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to store user data in localStorage");
    }

    if (this.debug) {
      console.log(
        "[ReactAuthClientSdkAdapter] storeUserData() - User data appears to have been stored in window.localStorage successfully!",
      );
    }

    return;
  }

  public getUserData(): UserData | null {
    try {
      const user_data_str: string | null = window.localStorage.getItem(
        AuthClientSdkAdapterLocalStorageKeys.USER_DATA,
      );
      if (!user_data_str) {
        return null;
      }
      const user_data = JSON.parse(user_data_str);
      const parsed = userDataSchema.safeParse(user_data);
      if (!parsed.success) {
        console.error(
          "Invalid user data loaded from window.localStorage: ",
          parsed.error,
        );
        throw new Error("Invalid user data");
      }

      const userData: UserData = parsed.data;

      if (this.debug) {
        console.log(
          "[ReactAuthClientSdkAdapter] getUserData(window.localStorage) => ",
          userData,
        );
      }

      return userData;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to get user data from localStorage");
    }
  }

  public clearUserData(): void {
    if (this.debug) {
      console.log("[ReactAuthClientSdkAdapter] clearUserData()");
    }

    try {
      window.localStorage.removeItem(
        AuthClientSdkAdapterLocalStorageKeys.USER_DATA,
      );
    } catch (e: unknown) {
      console.error("Failed to clear user data from localStorage: ", e);
      throw new Error("Failed to clear user data from localStorage!");
    }
  }

  public clearAccessToken(token_id: string): void {
    deleteCookie(AccessTokenCookieName(token_id));
    deleteCookie(AccessTokenExpiryCookieName(token_id));
  }

  public storeHttpOnlyRefreshTokenMarker(expiry: number): void {
    const cookie_options = {
      httpOnly: false,
      secure: this.ssl_enabled,
      sameSite: "lax" as const,
      expires: new Date(expiry),
    };
    setCookie(
      RefreshTokenExpiryCookieName(this.client_app_id),
      String(expiry),
      cookie_options,
    );
  }

  public clearHttpOnlyRefreshTokenMarker(): void {
    deleteCookie(RefreshTokenExpiryCookieName(this.client_app_id));
  }

  public doesSupportHttpOnlyRefreshToken(): boolean {
    const client_app_id: AppId = this.client_app_id;
    if (typeof client_app_id !== "string") {
      throw new TypeError("Expected 'client_app_id' to be a string!");
    }
    const isAuthServer: boolean = client_app_id === SCHEMAVAULTS_AUTH_APP_ID;
    if (isAuthServer) {
      return true;
    }
    // else, this is a client application
    // we only use http-only refresh tokens in secure contexts
    const environment: SchemaVaultsAppEnvironment = this.environment;
    if (environment === "development" || environment === "test") {
      return false;
    }
    return true;
  }

  /**
   * @description we can't directly read HTTP-only cookies from JS, so we can't access the token itself
   * however, a companion non-HTTP-only cookie is set with the expiry time of the refresh token
   * @returns True if there is a non-HTTP-only cookie indicating a valid HTTP-only refresh token is present, false otherwise
   */
  public hasHttpOnlyRefreshToken(): boolean {
    if (this.doesSupportHttpOnlyRefreshToken() satisfies boolean) {
      const expiry_cookie_key: string = RefreshTokenExpiryCookieName(
        this.client_app_id,
      );
      const refreshTokenExpiryStr: string | undefined | null = getCookie(
        expiry_cookie_key,
        {
          httpOnly: false,
          secure: this.ssl_enabled,
        },
      );
      if (typeof refreshTokenExpiryStr !== "string") {
        if (this.debug) {
          console.log(
            `[hasHttpOnlyRefreshToken] No refresh token expiry cookie found (key '${expiry_cookie_key}').`,
          );
        }
        return false;
      }
      const refreshTokenExpiryInt: number = parseInt(refreshTokenExpiryStr);
      if (isNaN(refreshTokenExpiryInt)) {
        if (this.debug) {
          console.log(
            "[hasHttpOnlyRefreshToken] Invalid refresh token expiry cookie value.",
          );
        }
        return false;
      }
      const refreshTokenExpiryTime: Date = new Date(refreshTokenExpiryInt);

      return Date.now() + 1000 < refreshTokenExpiryTime.getTime();
    } else {
      return false;
    }
  }

  private hasLocalStorageRefreshToken(): boolean {
    const refreshTokenJson: string | null = window.localStorage.getItem(
      RefreshTokenCookieName(this.client_app_id),
    );
    if (!refreshTokenJson) {
      return false;
    }
    const parsed_token = refreshTokenDataSchema.safeParse(
      JSON.parse(refreshTokenJson),
    );
    if (!parsed_token.success) {
      this.clearLocalStorageRefreshToken();
      return false;
    }
    const refreshToken: RefreshToken = parsed_token.data;
    const exp: number = refreshToken.exp;
    const expired: boolean = Date.now() >= exp;
    if (expired) {
      this.clearLocalStorageRefreshToken();
      return false;
    }
    return !expired;
  }

  private clearLocalStorageRefreshToken(): void {
    window.localStorage.removeItem(RefreshTokenCookieName(this.client_app_id));
    window.localStorage.removeItem(
      RefreshTokenExpiryCookieName(this.client_app_id),
    );
  }

  public hasRefreshToken(): boolean {
    if (this.doesSupportHttpOnlyRefreshToken()) {
      return this.hasHttpOnlyRefreshToken();
    } else {
      return this.hasLocalStorageRefreshToken();
    }
  }

  public relativeUrlToAbsoluteUrl(relative_url: string): string {
    if (typeof relative_url !== "string" || relative_url.length === 0) {
      throw new TypeError(
        "Expected first argument to relativeUrlToAbsoluteUrl to be a string!",
      );
    }
    if (!relative_url.startsWith("/")) {
      throw new TypeError("Expected 'relative_url' to start with a '/'!");
    }
    if (!isClientRuntime()) {
      throw new Error(
        "[relativeUrlToAbsoluteUrl] This should only be called from the client!",
      );
    }
    const absolute_url: string = `${window.location.origin}${relative_url}`;
    return absolute_url;
  }

  /**
   * Browser implementation of base64url encoding. Uses `btoa` which is
   * available in every browser environment this adapter targets.
   */
  public toBase64UrlFromBytes(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}

export default ReactAuthClientSdkAdapter;
