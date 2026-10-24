"use client";

import { useEffect, useState, useTransition, type FC, type ReactElement } from "react";
import type { ConnectedApp, ConnectedAppScope } from "@schemavaults/auth-common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { AppWindow, Loader2, Unplug, X } from "lucide-react";

export interface ConnectedAppsCardProps {
  /** The user's connected apps (server-rendered); loaded client-side when absent. */
  preloaded?: readonly ConnectedApp[];
  className?: string;
}

type RevokeTarget =
  | { kind: "app"; app: ConnectedApp }
  | { kind: "scope"; app: ConnectedApp; scope: ConnectedAppScope };

/** The scopes of one app grouped by API server, in listing order. */
function groupByApiServer(
  scopes: readonly ConnectedAppScope[],
): { api_server_id: string; api_server_name: string; scopes: ConnectedAppScope[] }[] {
  const groups = new Map<string, { api_server_id: string; api_server_name: string; scopes: ConnectedAppScope[] }>();
  for (const scope of scopes) {
    const group = groups.get(scope.api_server_id) ?? {
      api_server_id: scope.api_server_id,
      api_server_name: scope.api_server_name,
      scopes: [],
    };
    group.scopes.push(scope);
    groups.set(scope.api_server_id, group);
  }
  return [...groups.values()];
}

/**
 * The user's third-party access: every client application they authorized
 * to receive tokens on their behalf, with the API scopes they granted it.
 * Withdrawing a scope revokes the app's access tokens for that API server
 * (the app stays authorized); removing an app revokes all its tokens, and
 * signing in to it asks for consent again.
 */
export const ConnectedAppsCard: FC<ConnectedAppsCardProps> = ({
  preloaded,
  className,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const [busy, startTransition] = useTransition();
  const [apps, setApps] = useState<readonly ConnectedApp[] | null>(preloaded ?? null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  function withClient<T>(action: (client: ISchemaVaultsAuthClient) => Promise<T>): Promise<T> {
    const authClient = auth.ready ? auth.client.current : undefined;
    if (!authClient) {
      return Promise.reject(new Error("Auth client is not available"));
    }
    return action(authClient);
  }

  async function reload(): Promise<void> {
    setApps(await withClient((client) => client.listMyConnectedApps()));
  }

  useEffect(() => {
    if (apps !== null || !auth.ready) return;
    startTransition(async () => {
      try {
        await reload();
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to load your connected apps",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
    // Load once the auth client is ready when nothing was preloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready]);

  function onConfirmRevoke(): void {
    const target = revokeTarget;
    if (!target) return;
    startTransition(async () => {
      try {
        if (target.kind === "app") {
          await withClient((client) => client.revokeClientApplicationAuthorization(target.app.app_id));
          toast({ variant: "default", title: `Removed ${target.app.app_name}'s access` });
        } else {
          await withClient((client) =>
            client.revokeMyAppScopeConsent(target.app.app_id, target.scope.api_server_scope_id),
          );
          toast({
            variant: "default",
            title: `Withdrew "${target.scope.scope}" from ${target.app.app_name}`,
          });
        }
        setRevokeTarget(null);
        await reload();
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: target.kind === "app" ? "Failed to remove the app's access" : "Failed to withdraw the scope",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <Card className={className} data-testid="connected-apps-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Unplug className="h-5 w-5 text-muted-foreground" />
          Third-party access
        </CardTitle>
        <CardDescription>
          Applications you allowed to sign you in and act on your behalf, and
          the permissions you granted each. Remove what you no longer use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {apps === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" role="status" />
          </div>
        ) : apps.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="connected-apps-empty">
            You have not given any application access to your account.
          </p>
        ) : (
          apps.map((app) => (
            <div
              key={app.app_id}
              className="rounded-md border p-4 space-y-3"
              data-testid="connected-app"
              data-app-id={app.app_id}
            >
              <div className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    <AppWindow className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="break-all">{app.app_name}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground break-all">{app.app_id}</p>
                  {app.app_description && (
                    <p className="text-sm text-muted-foreground">{app.app_description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Authorized <LocalDateTime value={app.authorized_at} showSeconds={false} />
                    {" · "}
                    Last used{" "}
                    <LocalDateTime value={app.last_used_at} showSeconds={false} fallback="never" />
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => setRevokeTarget({ kind: "app", app })}
                  data-testid={`remove-app-access-${app.app_id}`}
                >
                  Remove access
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Can</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  <li>Sign you in with your account</li>
                </ul>
                {groupByApiServer(app.api_scopes).map((group) => (
                  <div key={group.api_server_id} className="space-y-1">
                    <p className="text-sm">
                      On <span className="font-medium">{group.api_server_name}</span>
                    </p>
                    <ul className="space-y-1">
                      {group.scopes.map((scope) => (
                        <li
                          key={scope.api_server_scope_id}
                          className="flex flex-row items-start justify-between gap-2"
                          data-testid="connected-app-scope"
                          data-scope={scope.scope}
                        >
                          <div className="min-w-0">
                            <Badge variant="secondary" className="font-mono break-all">
                              {scope.scope}
                            </Badge>
                            <p className="text-xs text-muted-foreground">{scope.description}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            aria-label={`Withdraw ${scope.scope}`}
                            title="Withdraw this permission"
                            onClick={() => setRevokeTarget({ kind: "scope", app, scope })}
                            data-testid={`withdraw-scope-${scope.api_server_scope_id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open: boolean) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget?.kind === "scope" ? "Withdraw permission?" : "Remove access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.kind === "scope"
                ? `${revokeTarget.app.app_name} will no longer be able to use "${revokeTarget.scope.scope}" on ${revokeTarget.scope.api_server_name}. Its current access to ${revokeTarget.scope.api_server_name} is revoked; it has to ask you again for this permission.`
                : revokeTarget
                  ? `${revokeTarget.app.app_name} will be signed out and lose every permission you granted it. Signing in to it again asks for your consent again.`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={onConfirmRevoke}
              data-testid="confirm-revoke-connected-app"
            >
              {revokeTarget?.kind === "scope" ? "Withdraw" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ConnectedAppsCard;
