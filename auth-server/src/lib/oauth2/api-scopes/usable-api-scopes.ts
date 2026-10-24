import "server-only";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { listGrantableApiScopeValues } from "@/lib/auth-db/apis";
import { listConsentedApiScopeValues } from "@/lib/auth-db/api-scope-consents";

/**
 * The API scopes of `api_server_id` a user-delegated token of `client_app_id`
 * for `uid` may carry right now: those the app may still be granted on
 * behalf of users AND the user still consents to. The token endpoint
 * re-applies it at every code redemption and refresh, so an allowance an
 * API server owner removed, or a consent the user withdrew, stops being
 * carried forward. Empty without a binding.
 */
export async function listUsableApiScopeValues(
  dbh: ServerlessDatabase,
  {
    uid,
    client_app_id,
    api_server_id,
  }: { uid: string; client_app_id: AppId; api_server_id: ApiServerId | null },
): Promise<ReadonlySet<string>> {
  if (!api_server_id) {
    return new Set();
  }
  const [grantable, consented] = await Promise.all([
    listGrantableApiScopeValues(dbh.db, { client_app_id, api_server_id, grantee: "user" }),
    listConsentedApiScopeValues(dbh.db, { uid, client_app_id, api_server_id }),
  ]);
  const consentedSet = new Set(consented);
  return new Set(grantable.filter((scope) => consentedSet.has(scope)));
}

export default listUsableApiScopeValues;
