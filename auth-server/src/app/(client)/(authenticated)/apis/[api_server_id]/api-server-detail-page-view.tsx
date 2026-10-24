"use client";

import { useState, type ReactElement } from "react";
import {
  isHardcodedAppId,
  type SchemaVaultsApiServerDefinition,
  type SchemaVaultsApiServerDomainRef,
  type SchemaVaultsAppEnvironment
} from "@schemavaults/app-definitions";
import PageContainer from "@/components/PageContainer";
import { DetailRow } from "@/components/DetailRow";
import { uuidSync } from "@/lib/uuid/uuidSync";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { CreateApiServerDomainDialog, DeleteApiServerDialog, DisconnectAppToApiDialog, LocalDateTime, RemoveApiServerDomainDialog } from "@schemavaults/auth-ui";
import { Trash2, KeyRound, ListChecks, Plus, Unplug } from "lucide-react";
import { ApiServerDynamicClientsCard } from "@/components/ApiServerDynamicClients";
import { ApiServerScopesCard, AppScopeAllowancesDialog } from "@/components/ApiServerScopes";
import type { ApiServerScope } from "@schemavaults/auth-common";
import { ApiServerOrganizationMembershipCard } from "@/components/ApiServerOrganizationMembership";
import {
  DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY,
  DEFAULT_RESOURCE_URL_MATCH_MODE,
} from "@schemavaults/app-definitions";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface ConnectedApp {
  client_app_id: string;
  app_name: string;
  created_at: number;
}

export interface ApiServerDetailPageViewProps {
  api_server: SchemaVaultsApiServerDefinition;
  connected_apps: readonly ConnectedApp[];
  connected_domains: readonly SchemaVaultsApiServerDomainRef[];
  /** The API scopes the API server defines (none for hardcoded ones). */
  scopes: readonly ApiServerScope[];
  hardcoded: boolean;
  isOrgOwner: boolean;
  /** Whether the viewer is a platform administrator (may change admin-only settings). */
  isPlatformAdmin: boolean;
  current_environment: SchemaVaultsAppEnvironment;
}

function DomainRow({ domain, dateKey, onRemove }: { domain: SchemaVaultsApiServerDomainRef; dateKey: string; onRemove?: () => void }) {
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
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove domain ${domain.domain}`}
            title="Remove"
            id={`remove-api-server-domain-button-${domain.api_server_domain_ref_id}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ApiServerDetailPageView({
  api_server,
  connected_apps,
  connected_domains,
  scopes,
  hardcoded,
  isOrgOwner,
  isPlatformAdmin,
  current_environment,
}: ApiServerDetailPageViewProps): ReactElement {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addDomainDialogOpen, setAddDomainDialogOpen] = useState(false);
  const [removeDomainTarget, setRemoveDomainTarget] = useState<SchemaVaultsApiServerDomainRef | null>(null);
  const [apps, setApps] = useState<readonly ConnectedApp[]>(connected_apps);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectedApp | null>(null);
  const [scopesTarget, setScopesTarget] = useState<ConnectedApp | null>(null);
  const router = useRouter();

  // Same gate as the "Add domain" row action on the /apis table: viewers
  // with read-only (organization member) access never see the add / remove
  // controls, and hardcoded API servers take their domains from the server's
  // environment rather than a database row. The server enforces this on
  // POST and DELETE regardless.
  const canManageDomains: boolean = !hardcoded && isOrgOwner;

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
            <DetailRow label="Owner Organization ID" value={api_server.owner_organization_id} href={`/orgs/${api_server.owner_organization_id}`} />
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
                <DomainRow key={domain.api_server_domain_ref_id} domain={domain} dateKey={domain.api_server_domain_ref_id} onRemove={canManageDomains ? () => setRemoveDomainTarget(domain) : undefined} />
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
                      <DomainRow key={domain.api_server_domain_ref_id} domain={domain} dateKey={domain.api_server_domain_ref_id} onRemove={canManageDomains ? () => setRemoveDomainTarget(domain) : undefined} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
          {canManageDomains && (
            <Button
              variant="outline"
              className="mt-4"
              id="add-api-server-domain-button"
              onClick={() => setAddDomainDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add domain
            </Button>
          )}
        </CardContent>
      </Card>

      {canManageDomains && (
        <CreateApiServerDomainDialog
          api_server_id={api_server.api_server_id}
          open={addDomainDialogOpen}
          onOpenChange={setAddDomainDialogOpen}
          // Domains on this page come from server-side props, so re-render
          // the server component to show the new row.
          onCreated={() => router.refresh()}
          uuid={uuidSync}
        />
      )}

      {canManageDomains && removeDomainTarget && (
        <RemoveApiServerDomainDialog
          domain={removeDomainTarget}
          open={!!removeDomainTarget}
          onOpenChange={(open: boolean) => {
            if (!open) setRemoveDomainTarget(null);
          }}
          // Domains on this page come from server-side props, so re-render
          // the server component to drop the removed row.
          onRemoved={() => router.refresh()}
        />
      )}

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
                // Which of the API server's scopes the app may be granted.
                const canEditScopes = isOrgOwner && !hardcoded && scopes.length > 0;
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
                    {canEditScopes && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Scopes of ${app.app_name}`}
                        title="Scopes"
                        data-testid={`app-scope-allowances-${app.client_app_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setScopesTarget(app);
                        }}
                      >
                        <ListChecks className="h-4 w-4" />
                      </Button>
                    )}
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

      {!hardcoded && (
        <ApiServerScopesCard
          api_server_id={api_server.api_server_id}
          scopes={scopes}
          canManage={isOrgOwner}
        />
      )}

      {!hardcoded && (
        <ApiServerDynamicClientsCard
          api_server_id={api_server.api_server_id}
          allow_dynamic_clients={api_server.allow_dynamic_clients === true}
          resource_url_match_mode={
            api_server.resource_url_match_mode ?? DEFAULT_RESOURCE_URL_MATCH_MODE
          }
          canManage={isOrgOwner}
        />
      )}

      {!hardcoded && (
        <ApiServerOrganizationMembershipCard
          api_server_id={api_server.api_server_id}
          organization_membership_visibility={
            api_server.organization_membership_visibility ?? DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY
          }
          owner_organization_id={api_server.owner_organization_id ?? null}
          canChange={isPlatformAdmin}
        />
      )}

      {scopesTarget && (
        <AppScopeAllowancesDialog
          api_server_id={api_server.api_server_id}
          client_app_id={scopesTarget.client_app_id}
          client_app_name={scopesTarget.app_name}
          scopes={scopes}
          open={!!scopesTarget}
          onOpenChange={(open: boolean) => {
            if (!open) setScopesTarget(null);
          }}
        />
      )}

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
