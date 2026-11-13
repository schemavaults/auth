import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { listAuditEventsForOrganization, listAuditEventsForUser } from "@/lib/auth-db/audit-events";
import type { AuditLogPage } from "./audit-log-entry-schema";
import { DEFAULT_AUDIT_LOG_PAGE_SIZE } from "./event-types";
import { toAuditLogPage } from "./to-audit-log-entry";

/**
 * The first page of an audit log, as the API returns it, for the pages
 * that render it on the server. The caller has already checked that the
 * viewer may read the log.
 */
export async function loadFirstAuditLogPage(
  db: Kysely<AuthDatabase>,
  scope: { uid: string } | { organization_id: string },
): Promise<AuditLogPage> {
  const options = { limit: DEFAULT_AUDIT_LOG_PAGE_SIZE };
  if ("uid" in scope) {
    const page = await listAuditEventsForUser(db, scope.uid, options);
    return toAuditLogPage(page, { kind: "user", uid: scope.uid });
  }
  const page = await listAuditEventsForOrganization(db, scope.organization_id, options);
  return toAuditLogPage(page, { kind: "organization" });
}

export default loadFirstAuditLogPage;
