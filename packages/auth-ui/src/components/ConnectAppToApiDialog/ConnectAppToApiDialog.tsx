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
  useToast,
} from "@schemavaults/ui";
import { type ReactElement, useEffect, useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useForm,
} from "@schemavaults/ui";
import { useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlugZap } from "lucide-react";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";

export interface ConnectAppToApiDialogProps {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  preselectedApiServerId?: string;
}

export function ConnectAppToApiDialog({
  open,
  onOpenChange,
  preselectedApiServerId,
}: ConnectAppToApiDialogProps): ReactElement {
  const { toast } = useToast();
  const friendlyName: string = useAuthUiFriendlyName();
  const defaultValues = useMemo(
    () => ({
      api_server_id: preselectedApiServerId ?? "",
      client_app_id: "",
      created_at: Date.now(),
    }),
    [preselectedApiServerId],
  );
  const form = useForm<AppToApiPermission>({
    resolver: zodResolver(appToApiPermissionSchema),
    defaultValues,
  });
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const auth = useAuth();

  useEffect(() => {
    if (open && preselectedApiServerId) {
      form.reset({
        api_server_id: preselectedApiServerId,
        client_app_id: "",
        created_at: Date.now(),
      });
    }
  }, [open, preselectedApiServerId, form]);

  async function onSubmit(values: AppToApiPermission): Promise<void> {
    if (environment === "development") {
      console.log("Submitting App-to-API Permission creation form...");
      toast({
        variant: "default",
        title: "Submitting App-to-API Permission creation form...",
      });
    }

    try {
      const authClient = auth.ready ? auth.client.current : undefined;
      if (!authClient) {
        throw new Error("Auth client is not available");
      }
      await authClient.connectAppToApiServer(
        values.api_server_id,
        values.client_app_id,
      );
    } catch (e: unknown) {
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
      description: "It can now send the API server authenticated requests.",
    });
    form.reset();
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
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the UUID of the frontend client application.
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
