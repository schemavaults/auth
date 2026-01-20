const ERROR_IDS = [
  "unknown",
  "app_id_not_found",
  "unauthenticated",
  "forbidden",
  "load_user_data_failure",
  "internal_server_error",
] as const satisfies readonly string[];

export type SchemaVaultsAuthErrorId = (typeof ERROR_IDS)[number];

export const ERROR_MESSAGE_CATALOG: Record<SchemaVaultsAuthErrorId, string> = {
  unknown: "An unknown error occurred",
  app_id_not_found: "App with specified ID not found!",
  unauthenticated:
    "Failed to authenticate to figure out who you are! Try logging in again or contacting support...",
  forbidden:
    "Oops! You don't have permission to do that action! Get in touch with support if you believe this is a mistake!",
  load_user_data_failure:
    "There was an error loading data associated with your SchemaVaults account!",
  internal_server_error:
    "There was a problem in the SchemaVaults backend logic and something caused a crash!",
};

export function isValidErrorId(id: string): id is SchemaVaultsAuthErrorId {
  return ERROR_IDS.includes(id satisfies string as SchemaVaultsAuthErrorId);
}
