import type { z } from "@schemavaults/openapi-operations";
import type { AppServiceAccountSummary } from "@/lib/api/domain-schemas/apps";
import type { UserDocument } from "@/lib/auth-db/users";

/** Route label used for exception capture by the service account operations. */
export const SERVICE_ACCOUNT_ROUTE = "/api/apps/[app_id]/service-account";

/** The public view of a service account user document. */
export function summarizeServiceAccount(user: UserDocument): z.output<typeof AppServiceAccountSummary> {
  return {
    uid: user.uid,
    email: user.email,
    created_at: user.created_at,
    disabled: user.disabled ?? false,
  };
}
