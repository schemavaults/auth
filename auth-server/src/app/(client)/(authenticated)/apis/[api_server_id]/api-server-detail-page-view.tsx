"use client";

import type { ReactElement } from "react";
import type { SchemaVaultsApiServerDefinition, SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { DetailRow } from "@/components/DetailRow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import Link from "next/link";

export interface ConnectedApp {
  client_app_id: string;
  app_name: string;
  created_at: number;
}

export interface ApiServerDetailPageViewProps {
  api_server: SchemaVaultsApiServerDefinition;
  connected_apps: ConnectedApp[];
  connected_domains: SchemaVaultsApiServerDomainRef[];
}

export default function ApiServerDetailPageView({
  api_server,
  connected_apps,
  connected_domains,
}: ApiServerDetailPageViewProps): ReactElement {
  return (
    <PageContainer>
      <Card>
        <CardHeader>
          <CardTitle>{api_server.api_server_name}</CardTitle>
          {api_server.api_server_description && (
            <CardDescription>{api_server.api_server_description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label="API Server ID" value={api_server.api_server_id} />
          {api_server.owner_organization_id && (
            <DetailRow label="Owner Organization ID" value={api_server.owner_organization_id} href={`/org/${api_server.owner_organization_id}`} />
          )}
          <DetailRow label="Public" value={api_server.public ? "Yes" : "No"} />
          <DetailRow label="Created At" value={new Date(api_server.created_at).toLocaleDateString()} />
          <div className="pt-4">
            <Link
              href={`/apis/${api_server.api_server_id}/jwks-access-keys`}
              className="text-sm text-primary underline hover:no-underline"
            >
              JWKS Access Keys
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Domains</CardTitle>
          <CardDescription>
            Registered domains for this API server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected_domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains are currently registered for this API server.
            </p>
          ) : (
            <div className="space-y-3">
              {connected_domains.map((domain) => (
                <div
                  key={domain.api_server_domain_ref_id}
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
          <CardTitle>Connected Applications</CardTitle>
          <CardDescription>
            Client applications that have permission to access this API server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected_apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No applications are currently connected to this API server.
            </p>
          ) : (
            <div className="space-y-3">
              {connected_apps.map((app) => (
                <div
                  key={app.client_app_id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{app.app_name}</p>
                    <p className="text-xs text-muted-foreground">{app.client_app_id}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
