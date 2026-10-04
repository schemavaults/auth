"use client";

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  JsonViewer,
  type JsonValue,
} from "@schemavaults/ui";
import { ArrowLeft, Layers } from "lucide-react";
import PageContainer from "@/components/PageContainer";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { ClientErrorRow } from "@/lib/auth-db/client-errors";
import { DeleteClientErrorButton } from "@/components/ClientErrorsDashboard";
import { clientErrorPageFiltersToSearchParams } from "@/lib/client-errors/client-error-page-filters";

export interface AdminClientErrorDetailPageViewProps {
  clientError: ClientErrorRow;
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-1 border-b border-border/50 py-2 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-full shrink-0 text-sm font-medium text-muted-foreground sm:w-40">{label}</span>
      <span className="flex-1 break-all text-sm">{children}</span>
    </div>
  );
}

function Mono({ value }: { value: string | null }): ReactElement {
  return value ? <code className="font-mono text-xs">{value}</code> : <span className="text-muted-foreground">—</span>;
}

/** The context as the JSON viewer accepts it (a JSON round-trip drops anything it cannot show). */
function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function AdminClientErrorDetailPageView({ clientError }: AdminClientErrorDetailPageViewProps): ReactElement {
  const groupHref: string = `/admin/client-errors?${clientErrorPageFiltersToSearchParams({
    range: "all",
    client_app_id: null,
    fingerprint: clientError.fingerprint,
    q: null,
    page: 1,
  }).toString()}`;

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/client-errors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to client errors
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={groupHref} data-testid="client-error-view-group">
              <Layers className="mr-2 h-4 w-4" />
              All reports of this error
            </Link>
          </Button>
        </div>

        <Card className="w-full" data-testid="admin-client-error-detail-card">
          <CardHeader>
            <CardTitle data-testid="admin-client-error-detail-name">
              <code className="font-mono">{clientError.name}</code>
            </CardTitle>
            <CardDescription data-testid="admin-client-error-detail-message" className="break-all">
              {clientError.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Report ID">
              <Mono value={clientError.client_error_id} />
            </Row>
            <Row label="Received">
              <LocalDateTime value={clientError.created_at} />
            </Row>
            <Row label="Occurred (client clock)">
              <LocalDateTime value={clientError.occurred_at} />
            </Row>
            <Row label="Client app">
              <Link
                href={`/admin/client-errors?${new URLSearchParams({ range: "all", app: clientError.client_app_id }).toString()}`}
                className="font-mono text-xs underline hover:no-underline"
                title="All client errors of this app"
              >
                {clientError.client_app_id}
              </Link>
            </Row>
            <Row label="Operation">
              <Mono value={clientError.operation} />
            </Row>
            <Row label="Environment">
              <Mono value={clientError.app_env} />
            </Row>
            <Row label="SDK">
              <Mono
                value={
                  clientError.sdk_name ? `${clientError.sdk_name}@${clientError.sdk_version ?? "?"}` : null
                }
              />
            </Row>
            <Row label="Page">
              <Mono value={clientError.page_url} />
            </Row>
            <Row label="Origin">
              <Mono value={clientError.origin} />
            </Row>
            <Row label="User agent">
              <Mono value={clientError.user_agent} />
            </Row>
            <Row label="Reported user">
              {clientError.reported_uid ? (
                <span className="flex flex-col gap-0.5">
                  <Link
                    href={`/admin/users/${encodeURIComponent(clientError.reported_uid)}`}
                    className="font-mono text-xs underline hover:no-underline"
                  >
                    {clientError.reported_uid}
                  </Link>
                  <span className="text-muted-foreground text-xs">As reported by the client; not verified.</span>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Fingerprint">
              <Mono value={clientError.fingerprint} />
            </Row>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Stack trace</CardTitle>
            <CardDescription>
              {clientError.stack
                ? "As reported by the client, with its cause chain appended."
                : "The client sent no stack trace."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clientError.stack ? (
              <pre
                className="max-h-[32rem] overflow-x-auto whitespace-pre rounded bg-muted p-4 font-mono text-xs"
                data-testid="admin-client-error-detail-stack"
              >
                {clientError.stack}
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
              {clientError.context ? "Structured details the client attached." : "No context was attached."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clientError.context ? (
              <JsonViewer value={toJsonValue(clientError.context)} defaultExpandLevel={2} maxHeight="32rem" />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <DeleteClientErrorButton client_error_id={clientError.client_error_id} />
        </div>
      </div>
    </PageContainer>
  );
}

export default AdminClientErrorDetailPageView;
