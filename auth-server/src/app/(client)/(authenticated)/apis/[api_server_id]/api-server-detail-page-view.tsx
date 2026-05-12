"use client";

import { useState, type ReactElement } from "react";
import { isHardcodedAppId, type SchemaVaultsApiServerDefinition, type SchemaVaultsApiServerDomainRef, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { DetailRow } from "@/components/DetailRow";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { DeleteApiServerDialog, DisconnectAppToApiDialog, LocalDateTime } from "@schemavaults/auth-ui";
import { Trash2, KeyRound, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
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
  hardcoded: boolean;
  isOrgOwner: boolean;
  current_environment: SchemaVaultsAppEnvironment;
}

function DomainRow({ domain, dateKey }: { domain: { domain: string; environment: string; created_at: number; [key: string]: unknown }; dateKey: string }) {
  return (
    <div
      key={dateKey}
      className="flex items-center justify-between rounded-md border p-3"
    >
      <div>
        <p className="text-sm font-medium">{domain.domain}</p>
        <p className="text-xs text-muted-foreground">{domain.environment}</p>
      </div>
      <LocalDateTime
        value={domain.created_at}
        showSeconds={false}
        className="text-xs text-muted-foreground"
      />
    </div>
  );
}

export default function ApiServerDetailPageView({
  api_server,
  connected_apps,
  connected_domains,
  hardcoded,
  isOrgOwner,
  current_environment,
}: ApiServerDetailPageViewProps): ReactElement {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [apps, setApps] = useState<ConnectedApp[]>(connected_apps);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectedApp | null>(null);
  const router = useRouter();

  const activeDomains = connected_domains.filter((d) => d.environment === current_environment);
  const inactiveDomains = connected_domains.filter((d) => d.environment !== current_environment);
  const uniqueInactiveEnvs = [...new Set(inactiveDomains.map((d) => d.environment))];

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
          <DetailRow label="Created At" value={<LocalDateTime value={api_server.created_at} showSeconds={false} />} />
          {isOrgOwner && (
            <div className="pt-4">
              <Link href={`/apis/${api_server.api_server_id}/jwks-access-keys`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <KeyRound className="h-4 w-4" />
                  Manage Server Secrets
                </Button>
              </Link>
            </div>
          )}
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
          {activeDomains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains are registered for the current environment ({current_environment}).
            </p>
          ) : (
            <div className="space-y-3">
              {activeDomains.map((domain) => (
                <DomainRow key={domain.api_server_domain_ref_id} domain={domain} dateKey={domain.api_server_domain_ref_id} />
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
                      <DomainRow key={domain.api_server_domain_ref_id} domain={domain} dateKey={domain.api_server_domain_ref_id} />
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
          <CardTitle>Connected Applications</CardTitle>
          <CardDescription>
            Client applications that have permission to access this API server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No applications are currently connected to this API server.
            </p>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => {
                const canDisconnect =
                  isOrgOwner && !isHardcodedAppId(app.client_app_id);
                return (
                  <div
                    key={app.client_app_id}
                    className="flex items-center justify-between gap-2 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <Link
                      href={`/apps/${app.client_app_id}`}
                      className="flex flex-1 items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{app.app_name}</p>
                        <p className="text-xs text-muted-foreground">{app.client_app_id}</p>
                      </div>
                      <LocalDateTime
                        value={app.created_at}
                        showSeconds={false}
                        className="text-xs text-muted-foreground"
                      />
                    </Link>
                    {canDisconnect && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Disconnect ${app.app_name}`}
                        title="Disconnect"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDisconnectTarget(app);
                        }}
                      >
                        <Unplug className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {disconnectTarget && (
        <DisconnectAppToApiDialog
          api_server_id={api_server.api_server_id}
          api_server_name={api_server.api_server_name}
          client_app_id={disconnectTarget.client_app_id}
          client_app_name={disconnectTarget.app_name}
          confirmation_target="app"
          open={!!disconnectTarget}
          onOpenChange={(open: boolean) => {
            if (!open) setDisconnectTarget(null);
          }}
          onDisconnected={() => {
            const removedId = disconnectTarget.client_app_id;
            setApps((current) =>
              current.filter((a) => a.client_app_id !== removedId),
            );
            setDisconnectTarget(null);
          }}
        />
      )}

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
                    <p className="font-medium">Delete this API server</p>
                    <p className="text-sm text-muted-foreground">
                      Once deleted, this API server and all its data will be permanently removed.
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

          <DeleteApiServerDialog
            api_server_id={api_server.api_server_id}
            api_server_name={api_server.api_server_name}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onDeleted={() => router.push("/apis")}
          />
        </>
      )}
    </PageContainer>
  );
}
