import { z } from "zod";
import {
  type AccessToken,
  type AuthTokenTypes,
  type RefreshToken,
  type UserData,
  type AuthToken,
  type RequestTokensResult,
  createAudienceSchema,
  type OrganizationID,
  organizationIdSchema,
} from "@schemavaults/auth-common";
import {
  appIdSchema,
  type AppId,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
  schemaVaultsAppEnvironments,
  getAuthServerUrl,
} from "@schemavaults/app-definitions";
import { type GenerateJWTOptions, generateJWT } from "./generate";
import type { I_JWT_Keys } from "./jwt_keys";

export interface IJWT_Factory_Init_Options {
  user: UserData;
  client_app_id: string;
  jwt_keys: I_JWT_Keys;
  environment: SchemaVaultsAppEnvironment;
  user_organizations: readonly OrganizationID[];
}

// This class is used to generate JWTs for a single user
// Initialize the factory with a user ID, then call loadUserData() to load the user's data
// Once the user's data is loaded, you can call refresh() or access() to generate a token
export class JWT_Factory {
  /**
   * ID of api server
   * validated to be either auth server url or uuid_v4 in constructor
   */
  private readonly client_app_id: AppId;
  private readonly user: UserData;
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly auth_server_url: string;
  private readonly jwt_keys: I_JWT_Keys;
  private readonly user_organizations: readonly OrganizationID[];

  public constructor(opts: IJWT_Factory_Init_Options) {
    // Save user data
    this.user = opts.user;

    // Get client app id
    const parsed_client_app_id = appIdSchema.safeParse(opts.client_app_id);
    if (!parsed_client_app_id.success) {
      throw new Error("Invalid client app ID");
    }
    this.client_app_id = parsed_client_app_id.data;

    // JWT Keys
    this.jwt_keys = opts.jwt_keys;

    // App environment (sets 'env' field of generated tokens)
    const parsed_app_environment = schemaVaultsAppEnvironmentSchema.safeParse(
      opts.environment satisfies SchemaVaultsAppEnvironment,
    );
    if (!parsed_app_environment.success) {
      throw new Error(
        `Invalid app environment to generate tokens for! Should be one of: ${schemaVaultsAppEnvironments.map((s) => `"${s}"`).join(", ")}`,
      );
    }
    this.environment = parsed_app_environment.data;

    if (!Array.isArray(opts.user_organizations)) {
      throw new TypeError(
        "Invalid user organizations, expected 'user_organizations' field to be an array",
      );
    } else if (
      !opts.user_organizations.every(
        (item) =>
          typeof item === "string" &&
          organizationIdSchema.safeParse(item).success,
      )
    ) {
      throw new TypeError(
        "Invalid user organizations, expected 'user_organizations' field to be an array of valid organization IDs",
      );
    }
    this.user_organizations = opts.user_organizations;

    this.auth_server_url = getAuthServerUrl(this.environment);
  }

  private get uid(): string {
    const user = this.user;
    if (typeof user.uid !== "string") {
      throw new Error(
        `Invalid user ID, not a string! Received typeof ${typeof user.uid}`,
      );
    }
    return this.user.uid;
  }

  private static get iat(): number {
    return Date.now();
  }

  private async generate<T extends AuthTokenTypes>(
    type: T,
    aud: string,
    opts?: { scope?: string },
  ): Promise<T extends "access" ? AccessToken : RefreshToken> {
    // Make sure the token type is valid
    if (type !== "refresh" && type !== "access") {
      throw new Error("Invalid token type");
    }

    if (!aud || typeof aud !== "string") {
      throw new Error("Missing audience argument");
    }

    const uid = this.uid;
    if (this.user.uid !== uid) {
      throw new Error("User data does not match user ID");
    }

    const iat: number = JWT_Factory.iat;

    if (type === "refresh") {
      // refresh tokens are always addressed to the auth server
      if (aud !== this.auth_server_url) {
        throw new Error(
          "Refresh tokens must have an audience directed at the SchemaVaults Auth Server URL",
        );
      }
    } else if (type === "access" && aud === this.auth_server_url) {
      // Always allow audience to be the auth server
    } else {
      const parsed_as_uuid_aud = await createAudienceSchema(
        z,
        this.environment,
      ).safeParseAsync(aud);
      if (!parsed_as_uuid_aud.success) {
        throw new Error(
          "Expected audience to reference a valid app, API, or FS server!",
        );
      }
    }

    const generateTokenOptions: GenerateJWTOptions<typeof type> = {
      user: this.user,
      type,
      iat,
      audience: aud,
      client_app_id: this.client_app_id,
      auth_server_url: this.auth_server_url,
      jwt_keys: this.jwt_keys satisfies I_JWT_Keys,
      env: this.environment satisfies SchemaVaultsAppEnvironment,
      ...(opts?.scope ? { scope: opts.scope } : {}),
    };

    const jwt: AuthToken = await generateJWT(generateTokenOptions);

    return jwt as T extends "access" ? AccessToken : RefreshToken;
  }

  public async refresh(opts?: { scope?: string }): Promise<RefreshToken> {
    return await this.generate("refresh", this.auth_server_url, opts);
  }

  public async access(
    audience: string,
    opts?: { scope?: string },
  ): Promise<AccessToken> {
    return await this.generate("access", audience, opts);
  }

  private async multipleAccessTokens(
    audiences: string[],
  ): Promise<Record<string, AccessToken>> {
    const accessTokens: Record<string, AccessToken> = {};

    const accessTokenPromises = audiences.map(
      (audience: string): Promise<AccessToken> => {
        return this.access(audience);
      },
    );
    const accessTokensList = await Promise.all(accessTokenPromises);
    accessTokensList.forEach((access_token): void => {
      accessTokens[access_token.aud] = access_token;
    });

    return accessTokens;
  }

  /**
   *
   * @returns Promise to result of generating access and/or refresh tokens
   */
  public async generateTokens(
    audiences?: string[] | string,
    replaceRefresh?: boolean,
  ): Promise<RequestTokensResult> {
    const client_app_id: AppId = this.client_app_id;
    let access_token_audiences: string[];

    if (typeof audiences === "string")
      access_token_audiences = [audiences] satisfies string[];
    else if (Array.isArray(audiences)) {
      access_token_audiences = audiences;
    } else
      throw new Error(
        "Invalid audiences argument to JWT_Factory.generateTokens()",
      );

    if (access_token_audiences.length === 0)
      console.warn("Did not receive any audiences to create access tokens for");
    else if (access_token_audiences.length > 16)
      throw new Error("Cannot request more than 16 access tokens at one time");

    try {
      const refreshTokenPromise: Promise<RefreshToken> | Promise<undefined> =
        replaceRefresh ? this.refresh() : (async () => undefined)();

      const tokenGenerationResult: RequestTokensResult = {
        success: true,
        error: false,
        message: "Generated token(s) successfully",
        client_app_id,
        tokens: {
          refresh: await refreshTokenPromise,
          access: await this.multipleAccessTokens(access_token_audiences),
        },
        userData: this.user,
      };
      return tokenGenerationResult;
    } catch (e: unknown) {
      console.error(e);
      throw new Error(`Failed to generate initial tokens for uid ${this.uid}`);
    }
  }
}
