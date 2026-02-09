import { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { UserData, userDataSchema } from "@schemavaults/auth-common";

export interface ICheckIfAuthenticatedWithServerOpts {
  auth_server_uri: string;
  adapter: ISchemaVaultsAuthClientAdapter;
  client_app_id: string;
}

export default async function checkIfAuthenticatedWithServer({
  auth_server_uri,
  adapter,
  client_app_id,
}: ICheckIfAuthenticatedWithServerOpts): Promise<UserData | null> {
  const supportsHttpOnlyCookies: boolean =
    typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
    adapter.doesSupportHttpOnlyRefreshToken();

  if (!adapter.hasRefreshToken()) {
    return null;
  }

  const headers = new Headers();
  if (!supportsHttpOnlyCookies) {
    const token: string | undefined = adapter.getRefreshToken()?.token;
    if (!token) {
      return null;
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  let userData: UserData;
  try {
    const response = await adapter.fetch(
      `${auth_server_uri}/api/auth/whoami/${client_app_id}`,
      {
        method: "GET",
        credentials: "include",
        headers,
      },
    );
    if (response.status === 401 || response.status === 403) {
      return null;
    }
    if (!response.ok || response.status > 299) {
      throw new Error(`Failed to load authentication status from auth server!`);
    }
    const body = await response.json();
    if (typeof body !== "object" || !body) {
      throw new TypeError("Expected response body to be an object!");
    }
    if (!("success" in body) || !body.success) {
      throw new Error(
        "Did not receive 'success=true' response from whoami endpoint!",
      );
    } else if (
      !("user" in body) ||
      !body.user ||
      typeof body.user !== "object"
    ) {
      throw new Error(
        "Expected there to be a 'user' property in whoami API response!",
      );
    }
    const parsed_user = await userDataSchema.safeParseAsync(body.user);
    if (!parsed_user.success) {
      throw parsed_user.error;
    }
    userData = parsed_user.data;
  } catch (e: unknown) {
    console.error("Failed to load current user data from whoami API: ", e);
    throw new Error("Failed to load current user data from whoami API!");
  }

  return userData;
}
