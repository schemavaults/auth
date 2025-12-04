"use client";

import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import {
  type AccessToken,
  PKCE_ProofKeyManager,
  type RefreshToken,
  type UserData,
  accessTokenDataSchema,
  refreshTokenDataSchema,
  userDataSchema,
} from "@schemavaults/auth-common";
import {
  type ISchemaVaultsAuthClientAdapter,
  IAuthClientPOSTResultType,
} from "@schemavaults/auth-client-sdk";
import { setCookie, deleteCookie, getCookie } from "cookies-next";
import type { OptionsType } from "cookies-next/lib/types";

const enum AuthClientSdkAdapterLocalStorageKeys {
  CODE_VERIFIERS = "code_verifiers",
  REFRESH_TOKEN = "refresh_token",
  USER_DATA = "user_data",
}

export interface IReactAuthClientSdkAdapterInitOptions {
  uuid?: () => string;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

// Next.js/React.js to JS Client SDK Adapter
export class ReactAuthClientSdkAdapter
  implements ISchemaVaultsAuthClientAdapter
{
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;

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
  }

  private get ssl(): boolean {
    const environment: SchemaVaultsAppEnvironment = this.environment;
    if (environment === "development" || environment === "test") return false;
    return true;
  }

  private cookieOptions: OptionsType = {
    httpOnly: false,
    secure: this.ssl,
    sameSite: "strict",
  };

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

  private saveCookie(key: string, value: string) {
    if (this.environment === "development") {
      console.log(
        `[ReactAuthClientSdkAdapter] Saving cookie to key: ${key} with value:`,
        value,
      );
    }
    if (value.length > 2049) {
      console.error(
        `[ReactAuthClientSdkAdapter] Cookie value too long for key: ${key}`,
      );
      throw new Error("Cookie value too long");
    }
    try {
      setCookie(key, value, this.cookieOptions);
      if (this.environment === "development") {
        console.log(
          `[ReactAuthClientSdkAdapter] Saved cookie to key: ${key} with value:`,
          value,
        );
      }
    } catch (e) {
      console.error(e);
      throw new Error("Failed to save cookie to key: " + key);
    }
    if (this.environment === "development") {
      const recently_saved_cookie = this.readCookie(key);
      if (!recently_saved_cookie || recently_saved_cookie !== value) {
        console.error(
          `[ReactAuthClientSdkAdapter] Cookie just saved does not appear to actually have been saved: ${key}`,
        );
        throw new Error(
          "Cookie just saved does not appear to actually have been saved",
        );
      } else {
        console.log(
          `[ReactAuthClientSdkAdapter] Allegedly saved cookie to key: ${key}`,
        );
      }
    }
  }

  private readCookie(key: string): string | null {
    return getCookie(key, this.cookieOptions) ?? null;
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
    const serialized_refresh_token = JSON.stringify(refresh_token);
    try {
      window.localStorage.setItem(
        AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN,
        serialized_refresh_token,
      );
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to store refresh token in localStorage");
    }
    try {
      this.saveCookie(
        AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN,
        refresh_token.token,
      );
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to save refresh token in cookie");
    }
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
    try {
      const serialized = window.localStorage.getItem(
        AuthClientSdkAdapterLocalStorageKeys.REFRESH_TOKEN,
      );
      if (!serialized) {
        return null;
      }
      const parsed = refreshTokenDataSchema.safeParse(JSON.parse(serialized));
      if (!parsed.success) {
        console.error(parsed.error);
        throw new Error("Invalid refresh token data");
      }
      return parsed.data;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to get refresh token from localStorage");
    }
  }

  public clearAuthTokens(): void {
    this.accessTokens = new Map();
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
  }

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
    if (Object.hasOwn(this.accessTokens, token_id)) {
      this.accessTokens.delete(token_id);
    } else {
      if (this.debug) {
        console.warn(`[clearAccessToken] No token with ID '${token_id}' found to clear; this is a no-op error.`)
      }
    }
  }
}
