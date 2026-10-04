"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Meter,
} from "@schemavaults/ui";
import { Settings } from "lucide-react";
import { formatBytes, type ClientErrorStorageStatus } from "@/lib/client-errors/row-size";

export interface ClientErrorStorageCardProps {
  storage: ClientErrorStorageStatus;
}

/** Whether the intake accepts reports, how much of the storage limit is used, and the retention period. */
export function ClientErrorStorageCard({ storage }: ClientErrorStorageCardProps): ReactElement {
  const full: boolean = storage.used_bytes >= storage.max_bytes;
  const percent: number = storage.max_bytes > 0 ? Math.min(100, (storage.used_bytes / storage.max_bytes) * 100) : 100;

  return (
    <Card className="min-w-0" data-testid="client-errors-storage">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Intake &amp; storage
            {!storage.accepting_reports ? (
              <Badge variant="secondary" data-testid="client-errors-intake-status">
                Not accepting reports
              </Badge>
            ) : full ? (
              <Badge variant="destructive" data-testid="client-errors-intake-status">
                Storage full: new reports refused
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="client-errors-intake-status">
                Accepting reports
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {storage.retention_days > 0
              ? `Reports older than ${storage.retention_days} day${storage.retention_days === 1 ? "" : "s"} are deleted automatically.`
              : "Reports are kept until an administrator deletes them."}
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Meter
          value={percent}
          label="Storage used"
          low={0}
          high={80}
          optimum={0}
          autoColorFromThresholds
          formatValue={(): string => `${formatBytes(storage.used_bytes)} of ${formatBytes(storage.max_bytes)}`}
          data-testid="client-errors-storage-meter"
        />
      </CardContent>
    </Card>
  );
}

export default ClientErrorStorageCard;
