"use client";

import { useState, type ReactElement } from "react";
import type { SchemaVaultsApp, SchemaVaultsAppDomainRef, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { DetailRow } from "@/components/DetailRow";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { DeleteAppDialog } from "@schemavaults/auth-ui";
import { ExternalLink, Trash2 } from "lucide-react";
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
  current_environment: SchemaVaultsAppEnvironment;
}

function LaunchButton(
  { domain, disabled }: {
    domain: { domain: string; environment: string; created_at: number;[key: string]: unknown },
    disabled: boolean
  }
): ReactElement {
  const button = (<Button
    variant="outline"
    size="sm"
    disabled={disabled}
    className="flex flex-row flex-nowrap gap-2"
  >
    <ExternalLink className="h-4 w-4" />
    Launch
  </Button>)

  if (disabled) { return button; }

  return (
    <a href={domain.domain} target="_blank" rel="noopener noreferrer">
      { button }
    </a>
  )
}

function DomainRow({ domain, dateKey, current_environment }: { domain: { domain: string; environment: string; created_at: number; [key: string]: unknown }; dateKey: string; current_environment: SchemaVaultsAppEnvironment }) {
  const environmentMismatch = domain.environment !== current_environment;
  const requiresHttps = domain.environment === "staging" || domain.environment === "production";
  const hasHttps = domain.domain.startsWith("https://");
  const disabled = environmentMismatch || (requiresHttps && !hasHttps);

  return (
    <div
      key={dateKey}
      className="flex items-center justify-between rounded-md border p-3"
    >
      <div>
        <p className="text-sm font-medium">{domain.domain}</p>
        <p className="text-xs text-muted-foreground">{domain.environment}</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {new Date(domain.created_at).toLocaleDateString()}
        </p>
        <LaunchButton domain={domain} disabled={disabled} />
      </div>
    </div>
  );
}

export default function AppDetailPageView({
  app,
  connected_api_servers,
  connected_domains,
  hardcoded,
  isOrgOwner,
  current_environment,
}: AppDetailPageViewProps): ReactElement {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const router = useRouter();

  const activeDomains = connected_domains.filter((d) => d.environment === current_environment);
  const inactiveDomains = connected_domains.filter((d) => d.environment !== current_environment);
  const uniqueInactiveEnvs = [...new Set(inactiveDomains.map((d) => d.environment))];

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
          {activeDomains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains are registered for the current environment ({current_environment}).
            </p>
          ) : (
            <div className="space-y-3">
              {activeDomains.map((domain) => (
                <DomainRow key={domain.app_domain_ref_id} domain={domain} dateKey={domain.app_domain_ref_id} current_environment={current_environment} />
              ))}
            </div>
          )}
          {inactiveDomains.length > 0 && (
            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="inactive-domains">
                <AccordionTrigger>
                  {inactiveDomains.length} domain{inactiveDomains.length !== 1 ? "s" : ""} in other environments ({uniqueInactiveEnvs.join(", ")})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {inactiveDomains.map((domain) => (
                      <DomainRow key={domain.app_domain_ref_id} domain={domain} dateKey={domain.app_domain_ref_id} current_environment={current_environment} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
