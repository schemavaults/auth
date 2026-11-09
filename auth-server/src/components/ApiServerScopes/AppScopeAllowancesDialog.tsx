"use client";

import { useEffect, useState, useTransition, type FC, type ReactElement } from "react";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import type { ApiServerScope, AppApiScopePolicy } from "@schemavaults/auth-common";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { Loader2, Save } from "lucide-react";

export interface AppScopeAllowancesDialogProps {
  api_server_id: ApiServerId;
  client_app_id: AppId;
  client_app_name: string;
  /** The scopes the API server defines. */
  scopes: readonly ApiServerScope[];
  /**
   * Whether the viewer may mark the connection first-party (platform
   * administrators); others see it read-only.
   */
  canChangeFirstParty?: boolean;
  /** Called with the saved first-party flag when it changed. */
  onFirstPartyChange?: (first_party: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ScopeChecklist({
  idPrefix,
  scopes,
  selected,
  disabled,
  onToggle,
}: {
  idPrefix: string;
  scopes: readonly ApiServerScope[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (scope: string, checked: boolean) => void;
}): ReactElement {
  return (
    <div className="space-y-2">
      {scopes.map((scope) => {
        const id = `${idPrefix}-${scope.api_server_scope_id}`;
        return (
          <div key={scope.api_server_scope_id} className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={selected.has(scope.scope)}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(scope.scope, checked === true)}
              data-testid={id}
            />
            <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal">
              <span className="font-mono text-sm break-all">{scope.scope}</span>
              <span className="text-xs text-muted-foreground">{scope.description}</span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Edits which of an API server's scopes one connected app may be granted:
 * on behalf of its users (every scope unless restricted; each user still
 * consents per scope, unless the connection is first-party) and for its own
 * service account on the client_credentials grant (none unless ticked).
 * Platform administrators also mark the connection first-party here.
 *
 * Mount it per opening, keyed by `client_app_id`: the allowances it loads
 * belong to the app it was mounted for.
 */
export const AppScopeAllowancesDialog: FC<AppScopeAllowancesDialogProps> = ({
  api_server_id,
  client_app_id,
  client_app_name,
  scopes,
  canChangeFirstParty = false,
  onFirstPartyChange,
  open,
  onOpenChange,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const [busy, startTransition] = useTransition();
  const [policy, setPolicy] = useState<AppApiScopePolicy | null>(null);
  const [restrict, setRestrict] = useState<boolean>(false);
  const [userScopes, setUserScopes] = useState<Set<string>>(new Set());
  const [serviceAccountScopes, setServiceAccountScopes] = useState<Set<string>>(new Set());
  // Whether the connection is first-party, as loaded and as edited.
  const [loadedFirstParty, setLoadedFirstParty] = useState<boolean>(false);
  const [firstParty, setFirstParty] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) throw new Error("Auth client is not available");
        const [loaded, loadedFirstPartyValue] = await Promise.all([
          authClient.getAppApiScopePolicy(api_server_id, client_app_id),
          authClient.getAppApiConnectionFirstParty(api_server_id, client_app_id),
        ]);
        setLoadedFirstParty(loadedFirstPartyValue);
        setFirstParty(loadedFirstPartyValue);
        setPolicy(loaded);
        setRestrict(loaded.restrict_user_scopes);
        setUserScopes(new Set(loaded.user_scopes));
        setServiceAccountScopes(new Set(loaded.service_account_scopes));
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to load the scope allowances",
          description: e instanceof Error ? e.message : String(e),
        });
        onOpenChange(false);
      }
    });
    // Reload whenever the dialog opens for an app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, api_server_id, client_app_id]);

  function toggle(set: Set<string>, update: (next: Set<string>) => void, scope: string, checked: boolean): void {
    const next = new Set(set);
    if (checked) next.add(scope);
    else next.delete(scope);
    update(next);
  }

  function save(): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) throw new Error("Auth client is not available");
        if (canChangeFirstParty && firstParty !== loadedFirstParty) {
          const savedFirstParty = await authClient.setAppApiConnectionFirstParty(
            api_server_id,
            client_app_id,
            firstParty,
          );
          setLoadedFirstParty(savedFirstParty);
          onFirstPartyChange?.(savedFirstParty);
        }
        const order = (set: Set<string>) =>
          scopes.map((s) => s.scope).filter((value) => set.has(value));
        const saved = await authClient.updateAppApiScopePolicy(api_server_id, client_app_id, {
          restrict_user_scopes: restrict,
          user_scopes: restrict ? order(userScopes) : [],
          service_account_scopes: order(serviceAccountScopes),
        });
        setPolicy(saved);
        toast({ variant: "default", title: `Scope allowances of ${client_app_name} saved` });
        onOpenChange(false);
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to save the scope allowances",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  const loading = policy === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90dvh] overflow-y-auto" data-testid="app-scope-allowances-dialog">
        <DialogHeader>
          <DialogTitle>Scopes for {client_app_name}</DialogTitle>
          <DialogDescription>
            Which of this API server&apos;s scopes the app may be granted.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" role="status" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex flex-row items-start justify-between gap-4">
                <div>
                  <Label htmlFor="restrict-user-scopes-switch" className="font-medium">
                    Restrict what users can grant
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Off: users may grant the app any of these scopes (they
                    approve each one on the consent screen, unless the
                    connection is first-party). On: only the ticked ones.
                  </p>
                </div>
                <Switch
                  id="restrict-user-scopes-switch"
                  checked={restrict}
                  disabled={busy}
                  onCheckedChange={(checked: boolean) => setRestrict(checked)}
                />
              </div>
              {restrict && (
                <ScopeChecklist
                  idPrefix="user-scope"
                  scopes={scopes}
                  selected={userScopes}
                  disabled={busy}
                  onToggle={(scope, checked) => toggle(userScopes, setUserScopes, scope, checked)}
                />
              )}
            </section>
            <section className="space-y-3 border-t pt-4">
              <div className="flex flex-row items-start justify-between gap-4">
                <div>
                  <Label htmlFor="first-party-connection-switch" className="font-medium">
                    First-party connection
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    On: the app and this API server belong to the same party.
                    Users signing in to the app for this API server are not
                    shown the consent screen: they consent implicitly to the
                    scopes the app asks for (within what users can grant
                    above).
                    {!canChangeFirstParty && " Only platform administrators can change this."}
                  </p>
                </div>
                <Switch
                  id="first-party-connection-switch"
                  checked={firstParty}
                  disabled={busy || !canChangeFirstParty}
                  onCheckedChange={(checked: boolean) => setFirstParty(checked)}
                  data-testid="first-party-connection-switch"
                />
              </div>
            </section>
            <section className="space-y-3 border-t pt-4">
              <div>
                <p className="font-medium">Service account (client credentials)</p>
                <p className="text-sm text-muted-foreground">
                  The scopes the app&apos;s own machine-to-machine tokens
                  carry. No user approves these, so none are granted unless
                  ticked here.
                </p>
              </div>
              <ScopeChecklist
                idPrefix="service-account-scope"
                scopes={scopes}
                selected={serviceAccountScopes}
                disabled={busy}
                onToggle={(scope, checked) =>
                  toggle(serviceAccountScopes, setServiceAccountScopes, scope, checked)
                }
              />
            </section>
          </div>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={busy || loading} data-testid="save-app-scope-allowances">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppScopeAllowancesDialog;
