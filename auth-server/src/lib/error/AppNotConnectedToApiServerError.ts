export class AppNotConnectedToApiServerError extends Error {
  public readonly client_app_id: string;
  public readonly api_server_id: string;

  public constructor(client_app_id: string, api_server_id: string) {
    super(
      `Client app '${client_app_id}' is not connected to API server '${api_server_id}'`,
    );
    this.name = "AppNotConnectedToApiServerError";
    this.client_app_id = client_app_id;
    this.api_server_id = api_server_id;
  }
}

export default AppNotConnectedToApiServerError;
