import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk"
import { getAuthServerUri } from "@/lib/auth_server_uri";

export function closeWindowRedirect(auth: ISchemaVaultsAuthClient): void {
  const auth_server_uri: string = getAuthServerUri();
  const close_window_url: string = `${auth_server_uri}/close_window`;
  window.location.href = close_window_url;
}
