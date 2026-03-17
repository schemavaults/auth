"use client";

import { useState, type ReactElement } from "react";
import type { SchemaVaultsApp, SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { DetailRow } from "@/components/DetailRow";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { DeleteAppDialog } from "@schemavaults/auth-ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface ConnectedApiServer {
  api_server_id: string;
  api_server_name: string;
  created_at: number;
}

export interface AppDetailPageViewProps {
  app: SchemaVaultsApp;
  connected_api_servers: ConnectedApiServer[];
  connected_domains: SchemaVaultsAppDomainRef[];
  hardcoded: boolean;
  isOrgOwner: boolean;
}

export default function AppDetailPageView({
  app,
  connected_api_servers,
  connected_domains,
  hardcoded,
  isOrgOwner,
}: AppDetailPageViewProps): ReactElement {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const router = useRouter();

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
            <DetailRow label="Owner Organization ID" value={app.owner_organization_id} href={`/org/${app.owner_organization_id}`} />
          )}
          <DetailRow label="Public" value={app.public ? "Yes" : "No"} />
          <DetailRow label="App Type" value={app.web ? "Web" : "Native"} />
          <DetailRow label="Created At" value={new Date(app.created_at).toLocaleDateString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Domains</CardTitle>
          <CardDescription>
            Registered domains for this application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected_domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains are currently registered for this application.
            </p>
          ) : (
            <div className="space-y-3">
              {connected_domains.map((domain) => (
                <div
                  key={domain.app_domain_ref_id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{domain.domain}</p>
                    <p className="text-xs text-muted-foreground">{domain.environment}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(domain.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
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

      {!hardcoded && isOrgOwner && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border border-destructive rounded-lg p-4">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Delete this application</p>
                    <p className="text-sm text-muted-foreground">
                      Once deleted, this application and all its data will be permanently removed.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <DeleteAppDialog
            app_id={app.app_id}
            app_name={app.app_name}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onDeleted={() => router.push("/apps")}
          />
        </>
      )}
    </PageContainer>
  );
}
