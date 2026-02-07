"use client";

import SchemaVaultsAuthClient, {
  type InitializeAuthClientOptions,
  type ISchemaVaultsAuthClient,
  type ISchemaVaultsAuthClientAdapter,
} from "@schemavaults/auth-client-sdk";
import ReactAuthClientSdkAdapter from "./react-auth-client-adapter";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export interface IAuthClientFactoryInitOpts {
  environment: SchemaVaultsAppEnvironment;
  app_id: AppId;
  debug?: boolean;
  default_audiences?: readonly ApiServerId[];
  auth_server_uri: string;
  successful_authentication_redirect_uri: string;
  successful_logout_redirect_uri: string;
  authorize_uri?: string | undefined;
  invite_code_required?: boolean;
  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}

export class AuthClientFactory {
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly secure: boolean;
  private readonly app_id: string;
  private readonly debug: boolean;
  private default_audiences?: readonly ApiServerId[];
  private readonly auth_server_uri: string;
  private readonly successful_authentication_redirect_uri: string;
  private readonly successful_logout_redirect_uri: string;
  private readonly authorize_uri: string | undefined;
  private readonly invite_code_required: boolean;
  private readonly fetch: (
    url: string,
    init: RequestInit | undefined,
  ) => Promise<Response>;

  public constructor(opts: IAuthClientFactoryInitOpts) {
    const environment: SchemaVaultsAppEnvironment = opts.environment;
    this.environment = environment;
    this.app_id = opts.app_id;
    const isInsecureHTTPContext: boolean = (window.location.protocol.startsWith(
      "http:",
    ) && !window.location.hostname.includes("localhost")) satisfies boolean;
    this.secure = !isInsecureHTTPContext;
    this.debug =
      typeof opts.debug === "boolean"
        ? opts.debug
        : environment === "development" ||
          environment === "test" ||
          environment === "staging";
    this.default_audiences = opts.default_audiences;
    this.auth_server_uri = opts.auth_server_uri;
    this.successful_authentication_redirect_uri =
      opts.successful_authentication_redirect_uri;
    this.successful_logout_redirect_uri = opts.successful_logout_redirect_uri;
    this.authorize_uri = opts.authorize_uri;
    this.invite_code_required =
      typeof opts.invite_code_required === "boolean"
        ? opts.invite_code_required
        : true;
    this.fetch = fetch;
  }

  private async createAuthClientWithUuidGenerator(): Promise<ISchemaVaultsAuthClient> {
    let uuid_generator: () => string;
    if (!this.secure) {
      const uuid_es_module = await import("uuid");
      uuid_generator = (): string => uuid_es_module.v4();
    } else {
      uuid_generator = () => crypto.randomUUID();
    }
    const auth = this.createFinalAuthClient(uuid_generator);
    return auth;
  }

  /**
   * @name createReactAuthClientAdapter
   * @param uuid A function that generates a random UUIDv4 (e.g. crypto.randomUUID(); but that only works in secure contexts)
   * @returns ISchemaVaultsAuthClientAdapter - An adapter that allows an ISchemaVaultsAuthClient implementation to store/retrieve stuff using the web client
   */
  private createReactAuthClientAdapter(
    uuid: () => string,
  ): ISchemaVaultsAuthClientAdapter {
    return new ReactAuthClientSdkAdapter({
      uuid,
      environment: this.environment,
      auth_server_uri: this.auth_server_uri,
      debug: this.debug,
      client_app_id: this.app_id,
      fetch: this.fetch,
    });
  }

  /**
   * @name createFinalAuthClient
   * @param uuid A function that generates a random UUIDv4 (e.g. crypto.randomUUID(); but that only works in secure contexts)
   * @returns An implementation of ISchemaVaultsAuthClient, initialized with a ReactAuthClientSdkAdapter
   */
  private createFinalAuthClient(uuid: () => string): ISchemaVaultsAuthClient {
    const environment = this.environment;
    const adapter: ISchemaVaultsAuthClientAdapter =
      this.createReactAuthClientAdapter(uuid);
    const auth_client_options: InitializeAuthClientOptions = {
      adapter,
      auth_server_uri: this.auth_server_uri,
      successful_authentication_redirect_uri:
        this.successful_authentication_redirect_uri,
      successful_logout_redirect_uri:
        this.successful_logout_redirect_uri ?? window.location.origin,
      authorize_uri: this.authorize_uri,
      app_id: this.app_id,
      default_audiences: this.default_audiences,
      debug: this.debug,
      app_env: environment,
      invite_code_required: this.invite_code_required,
    };

    const auth: ISchemaVaultsAuthClient = new SchemaVaultsAuthClient(
      auth_client_options,
    );

    if (this.debug) {
      console.log(
        "[useAuthClientInitialization] Initialized auth client at URL: ",
        window.location.href ?? undefined,
      );
    }

    return auth;
  }

  /**
   * @name createAuthClientInstance()
   * @returns A promise resolving to an instance implementing ISchemaVaultsAuthClient, with a ReactAuthClientSdkAdapter
   */
  public async createAuthClientInstance(): Promise<ISchemaVaultsAuthClient> {
    try {
      return await this.createAuthClientWithUuidGenerator();
    } catch (e: unknown) {
      console.error(
        "Failed to initialize SchemaVaultsAuthClient with ReactAuthClientSdkAdapter: ",
        e,
      );
      throw new Error(
        "Failed to initialize SchemaVaultsAuthClient with ReactAuthClientSdkAdapter!",
      );
    }
  }
}

export default AuthClientFactory;
