"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@schemavaults/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { ClientErrorRow } from "@/lib/auth-db/client-errors";
import { CLIENT_ERRORS_PAGE_SIZE } from "@/lib/client-errors/client-error-page-filters";
import { describeError, formatCount } from "./format";

export interface ClientErrorsTableProps {
  errors: readonly ClientErrorRow[];
  total: number;
  /** 1-based. */
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
}

/** One page of the client errors in the view, newest first. */
export function ClientErrorsTable({ errors, total, page, onPageChange, loading }: ClientErrorsTableProps): ReactElement {
  const pageCount: number = Math.max(1, Math.ceil(total / CLIENT_ERRORS_PAGE_SIZE));
  const first: number = total === 0 ? 0 : (page - 1) * CLIENT_ERRORS_PAGE_SIZE + 1;
  const last: number = Math.min(total, (page - 1) * CLIENT_ERRORS_PAGE_SIZE + errors.length);

  return (
    <Card className="min-w-0 lg:col-span-2" data-testid="client-errors-list">
      <CardHeader>
        <CardTitle className="text-base">Reports</CardTitle>
        <CardDescription>Every report in the view, newest first. Open one for its stack trace and context.</CardDescription>
      </CardHeader>
      <CardContent className={`min-w-0 overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
        {errors.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm" data-testid="client-errors-list-empty">
            No client errors in this view.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>App</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>SDK</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map(
                (error: ClientErrorRow): ReactElement => (
                  <TableRow key={error.client_error_id} data-testid="client-errors-list-row">
                    <TableCell className="whitespace-nowrap text-xs">
                      <Link
                        href={`/admin/client-errors/${error.client_error_id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        <LocalDateTime value={error.created_at} />
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{error.client_app_id}</TableCell>
                    <TableCell className="max-w-[32rem]">
                      <Link
                        href={`/admin/client-errors/${error.client_error_id}`}
                        className="block truncate font-mono text-xs underline-offset-2 hover:underline"
                        title={describeError(error.name, error.message)}
                      >
                        <span className="font-semibold">{error.name}</span>
                        {error.message ? `: ${error.message}` : null}
                      </Link>
                      {error.operation ? (
                        <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                          {error.operation}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {error.sdk_version ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs" data-testid="client-errors-list-range">
          {total === 0 ? "No reports" : `${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(): void => onPageChange(page - 1)}
            disabled={loading || page <= 1}
            data-testid="client-errors-list-previous"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Newer
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            Page {formatCount(page)} of {formatCount(pageCount)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(): void => onPageChange(page + 1)}
            disabled={loading || page >= pageCount}
            data-testid="client-errors-list-next"
          >
            Older
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default ClientErrorsTable;
