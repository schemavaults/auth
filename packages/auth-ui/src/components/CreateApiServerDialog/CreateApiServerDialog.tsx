"use client";

import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
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
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server } from "lucide-react";

interface CreateApiServerDialogProps {
  clearApiServersCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
}

let default_api_server_id: string = "";
try {
  default_api_server_id = crypto.randomUUID();
} catch (e: unknown) {}

export function CreateApiServerDialog({
  clearApiServersCache,
}: CreateApiServerDialogProps): ReactElement {
  const { toast } = useToast();

  const form = useForm<SchemaVaultsApiServerDefinition>({
    resolver: zodResolver(schemaVaultsApiServerDefinitionSchema),
    defaultValues: {
      api_server_name: "My Resource Server",
      api_server_id: default_api_server_id,
      api_server_description: "My API that does cool stuff",
      public: false,
      created_at: Date.now(),
    },
  });
  const auth = useAuth();
  const { mutate } = useSWRConfig();

  async function onSubmit(
    values: SchemaVaultsApiServerDefinition,
  ): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      console.log("Submitting API creation form...");
      toast({
        variant: "default",
        title: "Submitting API creation form...",
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
      const response = await fetch("/api/apis/create", {
        method: "POST",
        body: JSON.stringify(values),
        headers: {
          Authorization: `Bearer ${auth_access_jwt.token}}`,
        },
      });
      if (!response.ok || response.status !== 200) {
        throw new Error(
          `API server creation request has bad status: ${response.status}`,
        );
      }

      const body: object = await response.json();
      if (typeof body !== "object") {
        throw new Error(
          "Expected JSON object response from API server creation attempt",
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
          "API server creation response has success flag set to false",
        );
      }

      if (process.env.NODE_ENV === "development")
        console.log("Received response: ", body);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to create new API server",
        description:
          e instanceof Error ? e.message : `Failed to send network request`,
      });
      return;
    }

    toast({
      variant: "default",
      title: "Created new API server successfully",
    });
    clearApiServersCache(mutate);
    return;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Server className="h-4 w-4 mr-2" /> Create API
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
              <DialogTitle>Create a new API server</DialogTitle>
              <DialogDescription>
                Create a new frontend/client application which can access
                SchemaVaults APIs.
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="api_server_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Server Name</FormLabel>
                  <FormControl>
                    <Input placeholder={"My New Resource Server"} {...field} />
                  </FormControl>
                  <FormDescription>
                    Give a user-friendly name to the new backend API server
                    application.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="api_server_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="This API server provides search functionality to my new app."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe what this API server does.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="public"
              render={({ field }) => (
                <FormItem className="flex flex-row gap-2 items-center flex-wrap">
                  <FormLabel className="w-full">Public?</FormLabel>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription className="w-full">
                    Is this API publicly listed to end-users? I.e. can they find
                    it without having authorized a connected client application
                    first?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">
                <Server className="h-4 w-4 mr-2" />
                Create Server Application
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
