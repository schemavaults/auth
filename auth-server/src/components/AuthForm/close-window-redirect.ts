import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk"

export function closeWindowRedirect(auth: ISchemaVaultsAuthClient): void {
  const close_window_url: URL = new URL(
    "/close_window",
    auth.auth_server_url
  );
  window.location.href = close_window_url.toString();
  return;
}

export default closeWindowRedirect;
