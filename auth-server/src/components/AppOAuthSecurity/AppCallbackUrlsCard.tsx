"use client";

import { useMemo, useState, useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  schemaVaultsAppCallbackUrlRefSchema,
  schemaVaultsAppEnvironments,
  type AppId,
  type SchemaVaultsAppCallbackUrlRef,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
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
  Label,
  RadioGroup,
  RadioGroupItem,
  useForm,
  useToast,
} from "@schemavaults/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@schemavaults/auth-react-provider";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { Link2, Plus, Trash2 } from "lucide-react";

export interface AppCallbackUrlsCardProps {
  app_id: AppId;
  callback_urls: readonly SchemaVaultsAppCallbackUrlRef[];
  current_environment: SchemaVaultsAppEnvironment;
  /** Whether the viewer may add/remove callback URLs. */
  canManage: boolean;
  uuid: () => string;
}

/**
 * Management card for a client application's explicit OAuth2/OIDC
 * callback (redirect) URL allowlist. While the list for an environment
 * is empty, any path on a registered app domain is accepted as a
 * redirect_uri (legacy behavior); once at least one callback URL is
 * registered for an environment, only exact matches are accepted there.
 */
export const AppCallbackUrlsCard: FC<AppCallbackUrlsCardProps> = ({
  app_id,
  callback_urls,
  current_environment,
  canManage,
  uuid,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<SchemaVaultsAppCallbackUrlRef | null>(null);

  const defaultValues: Partial<SchemaVaultsAppCallbackUrlRef> = useMemo(
    () => ({
      app_callback_url_ref_id: uuid(),
      app_id,
      callback_url: "",
      environment: current_environment,
      created_at: Date.now(),
    }),
    [app_id, current_environment, uuid],
  );

  const form = useForm<SchemaVaultsAppCallbackUrlRef>({
    resolver: zodResolver(schemaVaultsAppCallbackUrlRefSchema),
    defaultValues,
  });

  function onSubmit(values: SchemaVaultsAppCallbackUrlRef): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.createClientApplicationCallbackUrl({
          ...values,
          created_at: Date.now(),
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to add callback URL",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
        return;
      }

      toast({ variant: "default", title: "Callback URL added" });
      form.reset({ ...defaultValues, app_callback_url_ref_id: uuid() });
      setAddDialogOpen(false);
      router.refresh();
    });
  }

  function onConfirmDelete(): void {
    const target = deleteTarget;
    if (!target) return;
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.deleteClientApplicationCallbackUrl(
          app_id,
          target.app_callback_url_ref_id,
        );
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to remove callback URL",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
        return;
      }
      toast({ variant: "default", title: "Callback URL removed" });
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Callback URLs
        </CardTitle>
        <CardDescription>
          Explicit OAuth2/OIDC redirect URLs for this application. While this
          list is empty for an environment, any path on a registered domain is
          accepted; once a callback URL is registered, only exact matches are
          accepted in that environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {callback_urls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No explicit callback URLs are registered. Redirects are validated
            against the app&apos;s registered domains (any path allowed).
          </p>
        ) : (
          <div className="space-y-3">
            {callback_urls.map((ref) => (
              <div
                key={ref.app_callback_url_ref_id}
                className="flex items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium break-all">
                    {ref.callback_url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ref.environment}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <LocalDateTime
                    value={ref.created_at}
                    showSeconds={false}
                    className="text-xs text-muted-foreground"
                  />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove callback URL ${ref.callback_url}`}
                      title="Remove"
                      disabled={busy}
                      onClick={() => setDeleteTarget(ref)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add callback URL
          </Button>
        )}
      </CardContent>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, function onFormError(e) {
                console.error("Callback URL form errors: ", e);
                toast({
                  variant: "destructive",
                  title: "Callback URL form has errors",
                });
              })}
              className="flex flex-col justify-start gap-4"
            >
              <DialogHeader>
                <DialogTitle>Add a callback URL</DialogTitle>
                <DialogDescription>
                  Register an exact redirect URL that OAuth2/OIDC flows may
                  send users back to.
                </DialogDescription>
              </DialogHeader>
              <FormField
                control={form.control}
                name="callback_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Callback URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://app.example.com/auth/callback"
                        {...field}
                        disabled={busy}
                      />
                    </FormControl>
                    <FormDescription>
                      The exact URL (including path) the auth server may
                      redirect back to. Fragments are not allowed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem className="flex flex-row gap-2 items-center flex-wrap">
                    <FormLabel className="w-full">Environment</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        value={field.value}
                        disabled={field.disabled || busy}
                        name={field.name}
                      >
                        {schemaVaultsAppEnvironments.map(
                          (app_env: SchemaVaultsAppEnvironment) => {
                            const radio_id = `callback-url-environment-radio-item-${app_env}`;
                            return (
                              <div
                                className="flex items-center space-x-2"
                                key={app_env}
                              >
                                <RadioGroupItem value={app_env} id={radio_id} />
                                <Label htmlFor={radio_id}>{app_env}</Label>
                              </div>
                            );
                          },
                        )}
                      </RadioGroup>
                    </FormControl>
                    <FormDescription className="w-full">
                      Which environment this callback URL applies to.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add callback URL
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
            <AlertDialogTitle>Remove callback URL?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.callback_url}" (${deleteTarget.environment}) will no longer be an allowed redirect URL. If it is the last callback URL for its environment, redirect validation falls back to the app's registered domains.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={onConfirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default AppCallbackUrlsCard;
