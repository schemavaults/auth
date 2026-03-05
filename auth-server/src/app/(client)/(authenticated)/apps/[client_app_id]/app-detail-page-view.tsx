"use client";

import type { ReactElement } from "react";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import Link from "next/link";

export interface ConnectedApiServer {
  api_server_id: string;
  api_server_name: string;
  created_at: number;
}

export interface AppDetailPageViewProps {
  app: SchemaVaultsApp;
  connected_api_servers: ConnectedApiServer[];
}

function DetailRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex flex-col gap-1 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-all">{value}</span>
    </div>
  );
}

export default function AppDetailPageView({
  app,
  connected_api_servers,
}: AppDetailPageViewProps): ReactElement {
  return (
    <PageContainer>
      <Card>
        <CardHeader>
          <CardTitle>{app.app_name}</CardTitle>
          {app.app_description && (
            <CardDescription>{app.app_description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label="App ID" value={app.app_id} />
          {app.owner_organization_id && (
            <DetailRow label="Owner Organization ID" value={app.owner_organization_id} />
          )}
          <DetailRow label="Public" value={app.public ? "Yes" : "No"} />
          <DetailRow label="App Type" value={app.web ? "Web" : "Native"} />
          <DetailRow label="Created At" value={new Date(app.created_at).toLocaleDateString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected API Servers</CardTitle>
          <CardDescription>
            API servers that this application has permission to access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected_api_servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API servers are currently connected to this application.
            </p>
          ) : (
            <div className="space-y-3">
              {connected_api_servers.map((server) => (
                <Link
                  key={server.api_server_id}
                  href={`/apis/${server.api_server_id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{server.api_server_name}</p>
                    <p className="text-xs text-muted-foreground">{server.api_server_id}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(server.created_at).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
