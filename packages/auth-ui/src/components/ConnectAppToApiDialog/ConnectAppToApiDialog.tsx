"use client";

import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Switch,
  useToast,
} from "@schemavaults/ui";
import { type ReactElement, useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useForm,
} from "@schemavaults/ui";
import { useAdmin, useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { isAppAlreadyConnectedToApiServerError } from "@schemavaults/auth-common";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlugZap } from "lucide-react";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";
import { canOfferFirstPartyConnection } from "./first-party-option";

export interface ConnectAppToApiDialogProps {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  /**
   * Pre-fills (and locks) the API server field, e.g. when opened from an
   * API server's row actions.
   */
  preselectedApiServerId?: string;
  /**
   * Pre-fills (and locks) the client app field, e.g. when opened from a
   * client application's row actions.
   */
  preselectedClientAppId?: string;
  /**
   * Called after the connection was created (before the dialog closes),
   * e.g. to refresh a server-rendered list of connected API servers.
   */
  onConnected?: (connection: {
    api_server_id: string;
    client_app_id: string;
    /** Whether the connection was also marked first-party. */
    first_party: boolean;
  }) => void;
}

const FIRST_PARTY_SWITCH_ID = "connect-app-to-api-first-party-switch";

export function ConnectAppToApiDialog({
  open,
  onOpenChange,
  preselectedApiServerId,
  preselectedClientAppId,
  onConnected,
}: ConnectAppToApiDialogProps): ReactElement {
  const { toast } = useToast();
  const friendlyName: string = useAuthUiFriendlyName();
  const defaultValues = useMemo(
    () => ({
      api_server_id: preselectedApiServerId ?? "",
      client_app_id: preselectedClientAppId ?? "",
      created_at: Date.now(),
    }),
    [preselectedApiServerId, preselectedClientAppId],
  );
  const form = useForm<AppToApiPermission>({
    resolver: zodResolver(appToApiPermissionSchema),
    defaultValues,
  });
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const auth = useAuth();
  // Marking a connection first-party waives every user's consent screen
  // for it, which only platform administrators may do (the server refuses
  // anyone else); hardcoded API servers define no API scopes to consent to.
  const admin: boolean = useAdmin();
  const apiServerIdValue: string = form.watch("api_server_id") ?? "";
  const canMarkFirstParty: boolean = canOfferFirstPartyConnection(
    admin,
    apiServerIdValue,
  );
  const [firstParty, setFirstParty] = useState<boolean>(false);
  // Every opening starts with the switch off (the dialog stays mounted
  // between openings in the tables that host it).
  const [wasOpen, setWasOpen] = useState<boolean>(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFirstParty(false);
  }

  useEffect(() => {
    if (open && (preselectedApiServerId || preselectedClientAppId)) {
      form.reset(defaultValues);
    }
  }, [
    open,
    preselectedApiServerId,
    preselectedClientAppId,
    defaultValues,
    form,
  ]);

  async function onSubmit(values: AppToApiPermission): Promise<void> {
    if (environment === "development") {
      console.log("Submitting App-to-API Permission creation form...");
      toast({
        variant: "default",
        title: "Submitting App-to-API Permission creation form...",
      });
    }

    const first_party: boolean =
      firstParty && canOfferFirstPartyConnection(admin, values.api_server_id);
    try {
      const authClient = auth.ready ? auth.client.current : undefined;
      if (!authClient) {
        throw new Error("Auth client is not available");
      }
      await authClient.connectAppToApiServer(
        values.api_server_id,
        values.client_app_id,
        first_party ? { first_party: true } : undefined,
      );
    } catch (e: unknown) {
      if (isAppAlreadyConnectedToApiServerError(e)) {
        toast({
          variant: "destructive",
          title: "Already connected",
          description:
            "This app already has access to this API server, so there was nothing to connect.",
        });
        return;
      }
      toast({
        variant: "destructive",
        title: "Failed to connect app to API server",
        description:
          e instanceof Error ? e.message : `Failed to send network request`,
      });
      return;
    }

    toast({
      variant: "default",
      title: "Connected app to API server successfully!",
      description: first_party
        ? "It can now send the API server authenticated requests. First-party connection: its users consent implicitly."
        : "It can now send the API server authenticated requests.",
    });
    onConnected?.({
      api_server_id: values.api_server_id,
      client_app_id: values.client_app_id,
      first_party,
    });
    form.reset();
    setFirstParty(false);
    onOpenChange(false);
    return;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="connect-app-to-api-dialog-content"
        className="sm:max-w-[425px]"
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (e: unknown) => {
              console.error(e);
              toast({
                variant: "destructive",
                title: "Failed to validate form inputs",
                description:
                  e instanceof Error
                    ? e.message
                    : "See the console for the full error message.",
              });
            })}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Connect an app to an API server</DialogTitle>
              <DialogDescription>
                Allow a frontend/client application to access {friendlyName}{" "}
                APIs.
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="client_app_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frontend Client App ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={"475af02e-0957-485c-bfdb-5315946d5b7e"}
                      {...field}
                      disabled={!!preselectedClientAppId}
                      readOnly={!!preselectedClientAppId}
                    />
                  </FormControl>
                  <FormDescription>
                    {preselectedClientAppId
                      ? "Client app ID is pre-selected."
                      : "Enter the UUID of the frontend client application."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="api_server_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Server ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={"fcf06e2d-fa7f-45bf-875f-9ca5384618c9"}
                      {...field}
                      disabled={!!preselectedApiServerId}
                      readOnly={!!preselectedApiServerId}
                    />
                  </FormControl>
                  <FormDescription>
                    {preselectedApiServerId
                      ? "API server ID is pre-selected."
                      : "Enter the UUID of the API server application."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canMarkFirstParty && (
              <div className="flex flex-row items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor={FIRST_PARTY_SWITCH_ID} className="font-medium">
                    First-party connection
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    The app and the API server belong to the same party:
                    users signing in to the app for this API server consent
                    implicitly, without the consent screen. Platform
                    administrators only; it can be changed later from the
                    API server&apos;s scope allowances.
                  </p>
                </div>
                <Switch
                  id={FIRST_PARTY_SWITCH_ID}
                  checked={firstParty}
                  disabled={form.formState.isSubmitting}
                  onCheckedChange={(checked: boolean) => setFirstParty(checked)}
                  data-testid={FIRST_PARTY_SWITCH_ID}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="submit">
                <PlugZap className="h-4 w-4 mr-2" />
                Connect app to API server
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export interface ConnectAppToApiDialogTriggerProps {
  onOpenChange: (val: boolean) => void;
}

export function ConnectAppToApiDialogTrigger({
  onOpenChange,
}: ConnectAppToApiDialogTriggerProps): ReactElement {
  return (
    <Button
      id="connect-app-to-api-dialog-trigger-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <PlugZap className="h-4 w-4 mr-2" /> Connect app to API
    </Button>
  );
}

export default ConnectAppToApiDialog;
