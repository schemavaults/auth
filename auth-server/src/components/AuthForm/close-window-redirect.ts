import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk"

export function closeWindowRedirect(auth: ISchemaVaultsAuthClient): void {
  const close_window_url: string = `${auth.auth_server_uri}/close_window`;
  window.location.href = close_window_url;
  return;
}

export default closeWindowRedirect;
