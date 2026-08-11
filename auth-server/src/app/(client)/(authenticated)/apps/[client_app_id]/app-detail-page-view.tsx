"use client";

import { useState, type ReactElement } from "react";
import { isHardcodedApiServerId, type SchemaVaultsApp, type SchemaVaultsAppCallbackUrlRef, type SchemaVaultsAppDomainRef, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { DetailRow } from "@/components/DetailRow";
import { AppCallbackUrlsCard, AppClientSecretCard } from "@/components/AppOAuthSecurity";
import { uuidSync } from "@/lib/uuid/uuidSync";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { DeleteAppDialog, DisconnectAppToApiDialog, LocalDateTime } from "@schemavaults/auth-ui";
import { ExternalLink, Trash2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface ConnectedApiServer {
  api_server_id: string;
  api_server_name: string;
  created_at: number;
}

export interface AppClientSecretMetadataProps {
  has_client_secret: boolean;
  created_at: number | null;
  updated_at: number | null;
}

export interface AppDetailPageViewProps {
  app: SchemaVaultsApp;
  connected_api_servers: readonly ConnectedApiServer[];
  connected_domains: readonly SchemaVaultsAppDomainRef[];
  callback_urls: readonly SchemaVaultsAppCallbackUrlRef[];
  client_secret_metadata: AppClientSecretMetadataProps;
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
    className="flex flex-row flex-nowrap gap-2 items-center justify-start"
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
        <LocalDateTime
          value={domain.created_at}
          showSeconds={false}
          className="text-xs text-muted-foreground"
        />
        <LaunchButton domain={domain} disabled={disabled} />
      </div>
    </div>
  );
}

export default function AppDetailPageView({
  app,
  connected_api_servers,
  connected_domains,
  callback_urls,
  client_secret_metadata,
  hardcoded,
  isOrgOwner,
  current_environment,
}: AppDetailPageViewProps): ReactElement {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [apiServers, setApiServers] = useState<readonly ConnectedApiServer[]>(connected_api_servers);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectedApiServer | null>(null);
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
          <DetailRow label="Created At" value={<LocalDateTime value={app.created_at} showSeconds={false} />} />
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

      {!hardcoded && (
        <AppCallbackUrlsCard
          app_id={app.app_id}
          callback_urls={callback_urls}
          current_environment={current_environment}
          canManage={isOrgOwner}
          uuid={uuidSync}
        />
      )}

      {!hardcoded && (
        <AppClientSecretCard
          app_id={app.app_id}
          has_client_secret={client_secret_metadata.has_client_secret}
          created_at={client_secret_metadata.created_at}
          updated_at={client_secret_metadata.updated_at}
          canManage={isOrgOwner}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected API Servers</CardTitle>
          <CardDescription>
            API servers that this application has permission to access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiServers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API servers are currently connected to this application.
            </p>
          ) : (
            <div className="space-y-3">
              {apiServers.map((server) => {
                const isHardcodedPair =
                  hardcoded && isHardcodedApiServerId(server.api_server_id);
                const canDisconnect = isOrgOwner && !isHardcodedPair;
                return (
                  <div
                    key={server.api_server_id}
                    className="flex items-center justify-between gap-2 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <Link
                      href={`/apis/${server.api_server_id}`}
                      className="flex flex-1 items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{server.api_server_name}</p>
                        <p className="text-xs text-muted-foreground">{server.api_server_id}</p>
                      </div>
                      <LocalDateTime
                        value={server.created_at}
                        showSeconds={false}
                        className="text-xs text-muted-foreground"
                      />
                    </Link>
                    {canDisconnect && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Disconnect from ${server.api_server_name}`}
                        title="Disconnect"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDisconnectTarget(server);
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
          api_server_id={disconnectTarget.api_server_id}
          api_server_name={disconnectTarget.api_server_name}
          client_app_id={app.app_id}
          client_app_name={app.app_name}
          confirmation_target="api_server"
          open={!!disconnectTarget}
          onOpenChange={(open: boolean) => {
            if (!open) setDisconnectTarget(null);
          }}
          onDisconnected={() => {
            const removedId = disconnectTarget.api_server_id;
            setApiServers((current) =>
              current.filter((s) => s.api_server_id !== removedId),
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
