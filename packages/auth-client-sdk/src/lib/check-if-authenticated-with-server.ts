import { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { UserData, userDataSchema } from "@schemavaults/auth-common";

export interface ICheckIfAuthenticatedWithServerOpts {
  auth_server_uri: string;
  adapter: ISchemaVaultsAuthClientAdapter;
}

export default async function checkIfAuthenticatedWithServer({
  auth_server_uri,
  adapter,
}: ICheckIfAuthenticatedWithServerOpts): Promise<UserData | null> {
  try {
    const response = await adapter.fetch(`${auth_server_uri}/api/auth/whoami`, {
      method: "GET",
      credentials: "include",
    });
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
    return parsed_user.data;
  } catch (e: unknown) {
    console.error("Failed to load current user data from whoami API: ", e);
    throw new Error("Faield to load current user data from whoami API!");
  }
}
