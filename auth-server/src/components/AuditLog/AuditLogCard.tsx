"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Timeline,
} from "@schemavaults/ui";
import { Loader2, ScrollText } from "lucide-react";
import type { AuditLogEntry, AuditLogPage } from "@/lib/audit-log/audit-log-entry-schema";
import { AuditLogTimelineItem } from "./AuditLogTimelineItem";
import { useAuditLog } from "./useAuditLog";

export interface AuditLogCardProps {
  /** `MY_AUDIT_LOG_ENDPOINT` or `getOrganizationAuditLogEndpoint(id)`. */
  endpoint: string;
  title: string;
  description: ReactNode;
  /** What to say when nothing was recorded yet. */
  emptyMessage: string;
  /** The signed-in user: entries naming them say "You". */
  viewer_uid?: string;
  /** Show which organization an entry belongs to (the user's own log). */
  showOrganization?: boolean;
  /** The first page, when the server rendered it. */
  preloaded?: AuditLogPage;
  className?: string;
}

/**
 * An audit log as a timeline, newest first, loading older pages on demand.
 * Used for the user's own log (/account/audit-log) and an organization's
 * (/orgs/{organization_id}/audit-log).
 */
export function AuditLogCard({
  endpoint,
  title,
  description,
  emptyMessage,
  viewer_uid,
  showOrganization = false,
  preloaded,
  className,
}: AuditLogCardProps): ReactElement {
  const { data, error, isLoading, isValidating, size, setSize } = useAuditLog(endpoint, preloaded);

  const entries: readonly AuditLogEntry[] = data ? data.flatMap((page) => page.entries) : [];
  const hasMore: boolean = data !== undefined && data.at(-1)?.next_cursor != null;
  const loadingMore: boolean = isValidating && data !== undefined && size > data.length;

  let content: ReactElement;
  if (!data && isLoading) {
    content = (
      <div className="min-h-24 w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  } else if (error && !data) {
    content = (
      <div
        className="min-h-16 w-full flex items-center justify-center text-sm text-destructive"
        data-testid="audit-log-error"
      >
        Failed to load the audit log: {error.message}
      </div>
    );
  } else if (entries.length === 0) {
    content = (
      <p className="text-sm text-muted-foreground" data-testid="audit-log-empty">
        {emptyMessage}
      </p>
    );
  } else {
    content = (
      <Timeline data-testid="audit-log-timeline">
        {entries.map((entry, index) => (
          <AuditLogTimelineItem
            key={entry.audit_event_id}
            entry={entry}
            isLast={index === entries.length - 1}
            viewer_uid={viewer_uid}
            showOrganization={showOrganization}
          />
        ))}
      </Timeline>
    );
  }

  return (
    <Card className={className ?? "w-full"} data-testid="audit-log-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
      {hasMore ? (
        <CardFooter>
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => void setSize(size + 1)}
            data-testid="audit-log-load-more"
            className="flex flex-row gap-2 flex-nowrap"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load older events
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export default AuditLogCard;
