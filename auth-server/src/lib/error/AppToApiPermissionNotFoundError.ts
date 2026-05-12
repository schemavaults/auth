export class AppToApiPermissionNotFoundError extends Error {
  public readonly client_app_id: string;
  public readonly api_server_id: string;

  public constructor(client_app_id: string, api_server_id: string) {
    super(
      `No app-to-API permission found for client app '${client_app_id}' and API server '${api_server_id}'`,
    );
    this.name = "AppToApiPermissionNotFoundError";
    this.client_app_id = client_app_id;
    this.api_server_id = api_server_id;
  }
}

export default AppToApiPermissionNotFoundError;
