import { loadAuthContext, type AuthContext } from "./load_auth_context";
import { TRPCError } from "@trpc/server";
import {
  type ApiServerId,
  getAppEnvironment,
  getAuthServerUri,
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  getSchemavaultsApiServerId,
  isUserInOrganization,
  type OrganizationID,
  type UserData,
  loadJwksAccessPrivateKey,
  type OrganizationMembershipRoleType,
} from "@schemavaults/auth-server-sdk";

export interface Base_SchemaVaults_tRPC_Resources {}

export interface SchemaVaults_tRPC_Context<
  R extends Base_SchemaVaults_tRPC_Resources,
> {
  user: AuthContext["user"] | null;
  isUserInOrganization: (
    user: UserData,
    org_id: OrganizationID,
  ) => Promise<OrganizationMembershipRoleType | false>;
  connected_server_resources: R;
  jwt_audience: string;
  environment: SchemaVaultsAppEnvironment;
  debug: boolean;
}

export interface ICreateContextFnOptions<
  R extends Base_SchemaVaults_tRPC_Resources,
> {
  getAuthHeader(): string | null;
  connected_server_resources: R;
  environment?: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

export type CreateContextFn<R extends Base_SchemaVaults_tRPC_Resources> = ({
  getAuthHeader,
  connected_server_resources,
}: ICreateContextFnOptions<R>) => Promise<SchemaVaults_tRPC_Context<R>>;

export async function createContext<
  R extends Base_SchemaVaults_tRPC_Resources = Base_SchemaVaults_tRPC_Resources,
>({
  getAuthHeader,
  connected_server_resources,
  ...opts
}: ICreateContextFnOptions<R>): Promise<SchemaVaults_tRPC_Context<R>> {
  let environment: SchemaVaultsAppEnvironment;
  if (typeof opts.environment === "string") {
    environment = opts.environment;
  } else {
    environment = getAppEnvironment();
  }

  if (!schemaVaultsAppEnvironmentSchema.safeParse(environment).success) {
    throw new Error("Invalid app environment!");
  }

  let debug: boolean;
  if (typeof opts.debug === "boolean") {
    debug = opts.debug;
  } else {
    debug =
      environment === "development" ||
      environment === "test" ||
      environment === "staging";
  }

  if (debug) {
    console.log("[createContext] Creating tRPC context...");
  }

  let authHeader: string | null;
  try {
    authHeader = getAuthHeader();
  } catch (e: unknown) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "There was an error parsing authentication details from request headers",
    });
  }

  let jwt_audience: ApiServerId;
  try {
    jwt_audience = getSchemavaultsApiServerId();
  } catch (e: unknown) {
    console.error(
      "[createContext] Failed to load API server ID from environment variables: ",
      e,
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }

  let jwks_access_private_key: CryptoKey;
  try {
    jwks_access_private_key = await loadJwksAccessPrivateKey(process.env);
  } catch (e: unknown) {
    console.error(
      "[createContext] Failed to load JWKS access private key from environment variables: ",
      e,
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }

  try {
    if (debug) {
      console.log("[createContext] Attempting to load auth context...");
    }
    const authContextPromise: Promise<AuthContext> =
      loadAuthContext(authHeader);
    if (debug) {
      console.log("[createContext] Attempting to load DB context...");
    }
    const authContext: AuthContext = await authContextPromise;

    if (debug) {
      console.log("[createContext] Loaded auth context: ", authContext);
    }

    const finalContext: SchemaVaults_tRPC_Context<R> = {
      user: authContext.user,
      isUserInOrganization: async (
        user: UserData,
        org_id: OrganizationID,
      ): Promise<OrganizationMembershipRoleType | false> => {
        return await isUserInOrganization(
          getAuthServerUri(environment),
          jwt_audience,
          jwks_access_private_key,
          user["uid"],
          org_id,
        );
      },
      connected_server_resources,
      jwt_audience,
      environment,
      debug,
    } as const satisfies SchemaVaults_tRPC_Context<R>;

    return finalContext;
  } catch (error: unknown) {
    console.error("[createContext] Error creating tRPC context", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create tRPC context",
    });
  }
}

export default createContext satisfies CreateContextFn<Base_SchemaVaults_tRPC_Resources>;
