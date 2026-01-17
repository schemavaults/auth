"use client";

import {
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type AccessToken,
  PKCE_ProofKeyManager,
  type RefreshToken,
  type UserData,
  accessTokenDataSchema,
  userDataSchema,
} from "@schemavaults/auth-common";
import {
  type ISchemaVaultsAuthClientAdapter,
  type IAuthClientPOSTResultType,
} from "@schemavaults/auth-client-sdk";
import { deleteCookie, getCookie } from "cookies-next/client";
import type { IReactAuthClientSdkAdapterInitOptions } from "@/types/IReactAuthClientSdkAdapterInitOptions";

const enum AuthClientSdkAdapterLocalStorageKeys {
  CODE_VERIFIERS = "code_verifiers",
  REFRESH_TOKEN = "refresh_token",
  REFRESH_TOKEN_EXPIRY = "refresh_token_expiry",
  USER_DATA = "user_data",
}

// Next.js/React.js to JS Client SDK Adapter
export class ReactAuthClientSdkAdapter
  implements ISchemaVaultsAuthClientAdapter
{
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;
  private readonly auth_server_uri: string;

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
      : getHardcodedClientWebAppDomain(
          SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
          this.environment,
        );
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

  private accessTokens: Map<string, AccessToken> = new Map();

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

  public async sendPOSTRequest(
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<IAuthClientPOSTResultType<object>> {
    if (this.debug) {
      console.log(`[ReactAuthClientSdkAdapter] POST -> "${url}"`, body);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });

      if (this.debug) {
        console.log(
          `Received response from POST request to "${url}"! ${response.ok ? "Ok" : "Error"}`,
        );
      }

      // if (!response.ok || response.status >= 300 || response.status < 200) {
      //   throw new Error(`HTTP response did not have a success status code: ${response.status}`)
      // }

      const response_body = await response.json();
      if (!response_body || typeof response_body !== "object") {
        throw new Error("Expected response to be a JSON object!");
      }

      const isOkStatusCode: boolean =
        response.status >= 200 && response.status < 300;

      const ok: boolean = response.ok && isOkStatusCode;

      const output: IAuthClientPOSTResultType<object> = {
        status: response.status,
        ok,
        data: response_body,
      };

      if (this.debug) {
        console.log(`[ReactAuthClientSdkAdapter] POST -> "${url}" ->`, output);
      }

      return output;
    } catch (e: unknown) {
      console.error(
        "Failed to send POST request using ReactAuthClientSdkAdapter: ",
        e,
      );
      throw new Error(
        "Failed to send POST request using ReactAuthClientSdkAdapter!",
      );
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
        throw new Error(
          "Invalid code verifier, code_verifiers object values should be strings",
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
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear code verifiers from local storage");
    }
  }

  public storeRefreshToken(refresh_token: RefreshToken): void {
    void refresh_token;
    throw new Error(
      "Refresh tokens should be set by the server as HTTP-only cookies for web-based authentication.",
    );
  }

  public storeAccessToken(token_id: string, access_token: AccessToken): void {
    this.accessTokens.set(token_id, access_token);
  }

  public getAccessToken(token_id: string): AccessToken | null {
    try {
      const serialized = this.accessTokens.get(token_id);
      if (!serialized) {
        return null;
      }
      const parsed = accessTokenDataSchema.safeParse(serialized);
      if (!parsed.success) {
        console.error(parsed.error);
        throw new Error("Invalid access token data");
      }
      return parsed.data;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to get access token from localStorage");
    }
  }

  public getRefreshToken(): RefreshToken | null {
    throw new Error(
      "Refresh tokens should be set by the server as HTTP-only cookies for web-based authentication.",
    );
  }

  public clearAccessTokens(): void {
    this.accessTokens = new Map();
    return;
  }

  public async clearHttpOnlyRefreshToken(): Promise<void> {
    try {
      await this.sendPOSTRequest(`${this.auth_server_uri}/api/logout`, {}, {});
    } catch (e: unknown) {
      console.error(
        "Failed to clear HTTP-only refresh token via network request to @schemavaults/auth-server: ",
        e,
      );
      throw new Error(
        "Failed to clear HTTP-only refresh token via network request to @schemavaults/auth-server",
      );
    }
    try {
      deleteCookie(AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN_EXPIRY);
    } catch (e: unknown) {
      throw new Error(
        `Failed to ensure cookie '${AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN_EXPIRY}' was deleted after logout!`,
      );
    }

    return;
  }

  public async clearAuthTokens(): Promise<void> {
    this.clearAccessTokens();
    try {
      window.localStorage.removeItem(
        AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN,
      );
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear refresh token from localStorage");
    }
    try {
      this.clearCookie(AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN);
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to clear refresh tokens from cookies");
    }
    await this.clearHttpOnlyRefreshToken();
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
    if (this.accessTokens) {
      if (this.accessTokens.has(token_id)) {
        this.accessTokens.delete(token_id);
        return;
      }
    }
    if (this.debug) {
      console.warn(
        `[clearAccessToken] No token with ID '${token_id}' found to clear; this is a no-op error.`,
      );
    }
    return;
  } // end of clearAccessToken()

  public doesSupportHttpOnlyRefreshToken(): true {
    return true;
  }

  /**
   * @description we can't directly read HTTP-only cookies from JS, so we can't access the token itself
   * however, a companion non-HTTP-only cookie is set with the expiry time of the refresh token
   * @returns True if there is a non-HTTP-only cookie indicating a valid HTTP-only refresh token is present, false otherwise
   */
  public hasHttpOnlyRefreshToken(): boolean {
    if (this.doesSupportHttpOnlyRefreshToken()) {
      const refreshTokenExpiryStr: string | undefined | null = getCookie(
        AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN_EXPIRY,
        {
          httpOnly: false,
          secure: this.ssl_enabled,
        },
      );
      if (typeof refreshTokenExpiryStr !== "string") {
        if (this.debug) {
          console.log(
            `[hasHttpOnlyRefreshToken] No refresh token expiry cookie found (key '${AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN_EXPIRY}').`,
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
      throw new Error(
        "Expected ReactAuthClientSdkAdapter to support HTTP-only refresh tokens",
      );
    }
  }

  public hasRefreshToken(): boolean {
    return this.hasHttpOnlyRefreshToken();
  }
}
