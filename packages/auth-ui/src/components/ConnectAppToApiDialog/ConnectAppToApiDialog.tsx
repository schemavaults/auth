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
import type { ReactElement } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useForm,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import type { AccessToken } from "@schemavaults/auth-common";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlugZap } from "lucide-react";

interface ConnectAppToApiDialogProps {}

export function ConnectAppToApiDialog({}: ConnectAppToApiDialogProps): ReactElement {
  const { toast } = useToast();
  const form = useForm<AppToApiPermission>({
    resolver: zodResolver(appToApiPermissionSchema),
    defaultValues: {
      api_server_id: "",
      client_app_id: "",
      created_at: Date.now(),
    },
  });
  const auth = useAuth();
  const { mutate } = useSWRConfig();

  async function onSubmit(values: AppToApiPermission): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      console.log("Submitting App-to-API Permission creation form...");
      toast({
        variant: "default",
        title: "Submitting App-to-API Permission creation form...",
      });
    }

    const authClient = auth.ready ? auth.client.current : undefined;
    if (!authClient) {
      toast({
        variant: "destructive",
        title: "Auth client not ready",
        description: `Cannot acquire an access token yet`,
      });
      return;
    }

    let auth_access_jwt: AccessToken;
    try {
      const auth_jwt = await authClient.acquireAccessToken({
        token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      });
      if (!auth_jwt) throw new Error("Failed to acquire auth access token");
      auth_access_jwt = auth_jwt;
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error loading authentication access token",
        description:
          e instanceof Error ? e.message : `Failed to prepare network request`,
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/apis/connect_app/${values.client_app_id}/${values.api_server_id}` as const,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth_access_jwt.token}}`,
          },
        },
      );
      if (!response.ok || response.status !== 200) {
        throw new Error(
          `API server creation request has bad status: ${response.status}`,
        );
      }

      const body: object = await response.json();
      if (typeof body !== "object") {
        throw new Error(
          "Expected JSON object response from app-to-api permission creation attempt",
        );
      }

      if (!body.hasOwnProperty("success"))
        throw new Error("No success field in response");

      if (
        !(
          typeof (body as { success: unknown }).success === "boolean" &&
          (body as { success: boolean }).success
        )
      ) {
        console.error(body);
        throw new Error(
          "App-to-API Permission creation response has success flag set to false",
        );
      }

      if (process.env.NODE_ENV === "development")
        console.log("Received response: ", body);
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
    return;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlugZap className="h-4 w-4 mr-2" /> Connect app to API
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (e: unknown) =>
              console.error(e),
            )}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Connect an app to an API server</DialogTitle>
              <DialogDescription>
                Allow a frontend/client application to access SchemaVaults APIs.
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
                    Enter the UUID of the API server application.
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
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the UUID of the API server application.
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
