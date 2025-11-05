import {
  type AccessToken,
  type AuthTokenTypes,
  type RefreshToken,
  type UserData,
  type AuthToken,
  type RequestTokensResult,
  audienceRefSchema,
  type OrganizationID,
} from "@schemavaults/auth";
import {
  appIdSchema,
  type AppId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
  schemaVaultsAppEnvironments,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import { type GenerateJWTOptions, generateJWT } from "./generate";
import { REFRESH_TOKEN_AUDIENCE } from "./aud";
import type { JWT_Keys } from "./jwt_keys";

export interface IJWT_Factory_Init_Options {
  user: UserData;
  client_app_id: string;
  jwt_keys: JWT_Keys;
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
  private static readonly REFRESH_TOKEN_AUDIENCE = REFRESH_TOKEN_AUDIENCE;
  private readonly jwt_keys: JWT_Keys;
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly user_organizations: readonly OrganizationID[];

  constructor(opts: IJWT_Factory_Init_Options) {
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

    this.user_organizations = opts.user_organizations;
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
      if (
        aud !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id ||
        aud !== REFRESH_TOKEN_AUDIENCE
      ) {
        throw new Error(
          "Refresh tokens must have an audience directed at the SchemaVaults Auth platform",
        );
      }
    } else if (aud === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      // Always allow audience to be the
    } else {
      const parsed_as_uuid_aud = await audienceRefSchema.safeParseAsync(aud);
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
      jwt_keys: this.jwt_keys satisfies JWT_Keys,
      env: this.environment satisfies SchemaVaultsAppEnvironment,
      orgs: this.user_organizations satisfies readonly OrganizationID[],
    };

    const jwt: AuthToken = await generateJWT(generateTokenOptions);

    return jwt as T extends "access" ? AccessToken : RefreshToken;
  }

  public async refresh(): Promise<RefreshToken> {
    const REFRESH_TOKEN_AUDIENCE = JWT_Factory.REFRESH_TOKEN_AUDIENCE;
    return await this.generate("refresh", REFRESH_TOKEN_AUDIENCE);
  }

  public async access(audience: string): Promise<AccessToken> {
    return await this.generate("access", audience);
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
        message: "Generated tokens successfully",
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
