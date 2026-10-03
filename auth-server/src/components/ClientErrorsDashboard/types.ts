import type { ClientErrorRow, ClientErrorStats } from "@/lib/auth-db/client-errors";
import type { ClientErrorPageFilters } from "@/lib/client-errors/client-error-page-filters";
import type { ClientErrorStorageStatus } from "@/lib/client-errors/row-size";

/** Everything the `/admin/client-errors` dashboard shows, loaded by the page for the filters in its URL. */
export interface ClientErrorsSnapshot {
  filters: ClientErrorPageFilters;
  stats: ClientErrorStats;
  errors: readonly ClientErrorRow[];
  /** Errors matching the filters, across pages. */
  total: number;
  /** The intake's settings and storage use (not filtered). */
  storage: ClientErrorStorageStatus;
  /** When the page loaded the snapshot (Unix epoch ms). */
  fetched_at: number;
}
