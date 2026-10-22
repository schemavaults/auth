"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { ApiServerId } from "@schemavaults/app-definitions";
import {
  MAX_API_SCOPES_PER_API_SERVER,
  createApiServerScopeRequestSchema,
  updateApiServerScopeRequestSchema,
  type ApiServerScope,
  type CreateApiServerScopeRequest,
  type UpdateApiServerScopeRequest,
} from "@schemavaults/auth-common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  useForm,
  useToast,
} from "@schemavaults/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@schemavaults/auth-react-provider";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { ListChecks, Pencil, Plus, Save, Trash2 } from "lucide-react";

export interface ApiServerScopesCardProps {
  api_server_id: ApiServerId;
  /** The scopes the API server defines (server-rendered). */
  scopes: readonly ApiServerScope[];
  /** Whether the viewer may define, edit and delete scopes. */
  canManage: boolean;
}

/**
 * Management card for an API server's API scopes: the OAuth 2.0 scope
 * values (e.g. `notes:read`) it defines for itself. A client requests
 * them on an authorization request whose RFC 8707 `resource` names this
 * API server; the access tokens minted for it carry the granted ones in
 * their `scope` claim, which the server's route guards enforce
 * (`requiredScopes` / `required_scopes`).
 */
export const ApiServerScopesCard: FC<ApiServerScopesCardProps> = ({
  api_server_id,
  scopes,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiServerScope | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiServerScope | null>(null);

  const addForm = useForm<CreateApiServerScopeRequest>({
    resolver: zodResolver(createApiServerScopeRequestSchema),
    defaultValues: { scope: "", description: "" },
  });
  const editForm = useForm<UpdateApiServerScopeRequest>({
    resolver: zodResolver(updateApiServerScopeRequestSchema),
    defaultValues: { description: "" },
  });

  function run(
    failureTitle: string,
    action: (client: ISchemaVaultsAuthClient) => Promise<void>,
    onSuccess: () => void,
  ): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await action(authClient);
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: failureTitle,
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
        return;
      }
      onSuccess();
      router.refresh();
    });
  }

  function onAdd(values: CreateApiServerScopeRequest): void {
    run(
      "Failed to define scope",
      async (client) => {
        await client.createApiServerScope(api_server_id, values);
      },
      () => {
        toast({ variant: "default", title: `Scope "${values.scope}" defined` });
        addForm.reset({ scope: "", description: "" });
        setAddDialogOpen(false);
      },
    );
  }

  function onEdit(values: UpdateApiServerScopeRequest): void {
    const target = editTarget;
    if (!target) return;
    run(
      "Failed to update scope",
      async (client) => {
        await client.updateApiServerScope(
          api_server_id,
          target.api_server_scope_id,
          values,
        );
      },
      () => {
        toast({ variant: "default", title: `Scope "${target.scope}" updated` });
        setEditTarget(null);
      },
    );
  }

  function onConfirmDelete(): void {
    const target = deleteTarget;
    if (!target) return;
    run(
      "Failed to delete scope",
      async (client) => {
        await client.deleteApiServerScope(api_server_id, target.api_server_scope_id);
      },
      () => {
        toast({ variant: "default", title: `Scope "${target.scope}" deleted` });
        setDeleteTarget(null);
      },
    );
  }

  const atLimit: boolean = scopes.length >= MAX_API_SCOPES_PER_API_SERVER;

  return (
    <Card data-testid="api-server-scopes-card">
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Scopes
        </CardTitle>
        <CardDescription>
          Permissions this API server defines, such as{" "}
          <code>notes:read</code>. Client applications request them together
          with this API server as the OAuth <code>resource</code>; the access
          tokens minted for this API server carry the granted ones in their{" "}
          <code>scope</code> claim, for your routes to enforce.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scopes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This API server defines no scopes yet.
          </p>
        ) : (
          <div className="space-y-3">
            {scopes.map((scope) => (
              <div
                key={scope.api_server_scope_id}
                className="flex items-center justify-between gap-2 rounded-md border p-3"
                data-testid="api-server-scope-row"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium font-mono break-all">
                    {scope.scope}
                  </p>
                  <p className="text-sm text-muted-foreground break-words">
                    {scope.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <LocalDateTime
                    value={scope.created_at}
                    showSeconds={false}
                    className="text-xs text-muted-foreground mr-2"
                  />
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit scope ${scope.scope}`}
                        title="Edit description"
                        disabled={busy}
                        onClick={() => {
                          editForm.reset({ description: scope.description });
                          setEditTarget(scope);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete scope ${scope.scope}`}
                        title="Delete"
                        disabled={busy}
                        onClick={() => setDeleteTarget(scope)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <Button
            variant="outline"
            disabled={busy || atLimit}
            title={
              atLimit
                ? `An API server defines at most ${MAX_API_SCOPES_PER_API_SERVER} scopes`
                : undefined
            }
            onClick={() => setAddDialogOpen(true)}
            data-testid="add-api-server-scope-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add scope
          </Button>
        )}
      </CardContent>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <Form {...addForm}>
            <form
              onSubmit={addForm.handleSubmit(onAdd)}
              className="flex flex-col justify-start gap-4"
            >
              <DialogHeader>
                <DialogTitle>Add a scope</DialogTitle>
                <DialogDescription>
                  Define a permission client applications can request for
                  this API server.
                </DialogDescription>
              </DialogHeader>
              <FormField
                control={addForm.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="notes:read"
                        autoComplete="off"
                        className="font-mono"
                        {...field}
                        disabled={busy}
                      />
                    </FormControl>
                    <FormDescription>
                      One word without spaces (letters, digits and punctuation
                      such as <code>:</code>, <code>.</code> or <code>/</code>).
                      It cannot be changed later. OpenID Connect scope names
                      such as <code>openid</code> or <code>email</code> are
                      reserved.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Read your notes"
                        {...field}
                        disabled={busy}
                      />
                    </FormControl>
                    <FormDescription>
                      What the scope lets an application do, in words your
                      users understand.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add scope
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open: boolean) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEdit)}
              className="flex flex-col justify-start gap-4"
            >
              <DialogHeader>
                <DialogTitle>
                  Edit <code>{editTarget?.scope}</code>
                </DialogTitle>
                <DialogDescription>
                  Only the description can change.
                </DialogDescription>
              </DialogHeader>
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={busy} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scope?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.scope}" will no longer be granted. Refreshed tokens stop carrying it; access tokens already issued with it keep it until they expire.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={onConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ApiServerScopesCard;
