const ERROR_IDS = [
  "unknown",
  "bad_request",
  "app_id_not_found",
  "api_server_id_not_found",
  "unauthenticated",
  "forbidden",
  "account_disabled",
  "load_user_data_failure",
  "internal_server_error",
  "load_server_config_failure",
  "server_misconfiguration",
  "account_not_in_organization",
] as const satisfies readonly string[];

export type SchemaVaultsAuthErrorId = (typeof ERROR_IDS)[number];

export const ERROR_MESSAGE_CATALOG: Record<SchemaVaultsAuthErrorId, string> = {
  unknown: "An unknown error occurred",
  bad_request: "Your request was malformed or invalid.",
  app_id_not_found: "App with specified ID not found!",
  api_server_id_not_found: "API server with specified ID not found",
  unauthenticated:
    "Failed to authenticate to figure out who you are! Try logging in again or contacting support...",
  forbidden:
    "Oops! You don't have permission to do that action! Get in touch with support if you believe this is a mistake!",
  account_disabled: "Your account has been disabled!",
  load_user_data_failure:
    "There was an error loading data associated with your SchemaVaults account!",
  internal_server_error:
    "There was a problem in the SchemaVaults backend logic and something caused a crash!",
  load_server_config_failure:
    "There was a problem loading server configuration settings.",
  server_misconfiguration:
    "The server does not appear to be configured properly. If you are the site admin, please see the logs for more details.",
  account_not_in_organization:
    "Your account is not a member of the organization required for the attempted action.",
};

export function isValidErrorId(id: string): id is SchemaVaultsAuthErrorId {
  return ERROR_IDS.includes(id satisfies string as SchemaVaultsAuthErrorId);
}
