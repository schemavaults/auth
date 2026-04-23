"use client";

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from "@schemavaults/ui";
import { ArrowLeft } from "lucide-react";
import PageContainer from "@/components/PageContainer";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { ErrorRow } from "@/lib/auth-db/errors";
import { DeleteErrorButton } from "@/components/ErrorsTable";

export interface AdminErrorDetailPageViewProps {
  errorRow: ErrorRow;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2 border-b border-border/50 last:border-b-0">
      <span className="w-full sm:w-40 shrink-0 text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm break-all flex-1">{children}</span>
    </div>
  );
}

function formatContext(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminErrorDetailPageView({
  errorRow,
}: AdminErrorDetailPageViewProps): ReactElement {
  const { stack, context } = errorRow;

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/errors">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to errors
            </Link>
          </Button>
        </div>
        <Card className="w-full" data-testid="admin-error-detail-card">
          <CardHeader>
            <CardTitle data-testid="admin-error-detail-name">
              <code className="font-mono">{errorRow.name}</code>
            </CardTitle>
            <CardDescription
              data-testid="admin-error-detail-message"
              className="break-all"
            >
              {errorRow.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Error ID">
              <code className="font-mono text-xs">{errorRow.error_id}</code>
            </Row>
            <Row label="Captured At">
              <LocalDateTime value={Number(errorRow.created_at)} />
            </Row>
            <Row label="Name">
              <code className="font-mono">{errorRow.name}</code>
            </Row>
            <Row label="Operation">
              {errorRow.op_name ? (
                <code className="font-mono">{errorRow.op_name}</code>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Route">
              {errorRow.route ? (
                <code className="font-mono">{errorRow.route}</code>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="User">
              {errorRow.uid ? (
                <Link
                  href={`/admin/users/${errorRow.uid}`}
                  className="font-mono text-xs underline hover:no-underline"
                >
                  {errorRow.uid}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap break-all bg-muted rounded p-4 font-mono">
              {errorRow.message}
            </pre>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Stack Trace</CardTitle>
            <CardDescription>
              {stack
                ? "Full stack trace captured at the time of the exception."
                : "No stack trace was captured (the thrown value was not an Error)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stack ? (
              <pre className="text-xs whitespace-pre overflow-x-auto bg-muted rounded p-4 font-mono max-h-[32rem]">
                {stack}
              </pre>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Context</CardTitle>
            <CardDescription>
              {context === null || context === undefined
                ? "No additional context was attached."
                : "Structured payload supplied by the caller."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {context === null || context === undefined ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              <pre className="text-xs whitespace-pre-wrap break-all bg-muted rounded p-4 font-mono max-h-[32rem] overflow-auto">
                {formatContext(context)}
              </pre>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <DeleteErrorButton error_id={errorRow.error_id} />
        </div>
      </div>
    </PageContainer>
  );
}

export default AdminErrorDetailPageView;
