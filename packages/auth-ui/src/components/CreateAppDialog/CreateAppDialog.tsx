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
import { type ReactElement, useMemo, useTransition } from "react";

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
import { useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import type { AccessToken } from "@schemavaults/auth-common";
import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppWindow } from "lucide-react";

interface CreateFrontendAppDialogProps {
  clearFrontendAppsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
}

export function CreateAppDialog({
  clearFrontendAppsCache,
}: CreateFrontendAppDialogProps): ReactElement {
  const { toast } = useToast();

  const defaultValues: Partial<SchemaVaultsApp> = useMemo(() => {
    return {
      app_name: "My Web App",
      app_id: crypto.randomUUID(),
      app_description: "Interact with my API",
      public: false,
      created_at: Date.now(),
    }
  }, [])

  const form = useForm<SchemaVaultsApp>({
    resolver: zodResolver(schemaVaultsAppDefinitionSchema),
    defaultValues,
  });
  const auth = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const { mutate } = useSWRConfig();
  const [submitting, startSubmitting] = useTransition();

  async function onSubmit(values: SchemaVaultsApp): Promise<void> {
    if (environment === "development") {
      console.log("Submitting frontend app creation form...");
      toast({
        variant: "default",
        title: "Submitting frontend app creation form...",
      });
    }

    startSubmitting(async () => {
      const authClient = auth.ready ? auth.client.current : undefined;
      if (!authClient) {
        toast({
          variant: "destructive",
          title: "Auth client not ready!",
          description: `Cannot acquire an access token to create app yet.`,
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
        const response = await fetch("/api/apps/create", {
          method: "POST",
          body: JSON.stringify(values),
          headers: {
            Authorization: `Bearer ${auth_access_jwt.token}}`,
          },
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Frontend app creation request has bad status: ${response.status}`,
          );
        }

        const body: object = await response.json();
        if (typeof body !== "object") {
          throw new Error(
            "Expected JSON object response from frontend app creation attempt",
          );
        }

        if (!Object.hasOwn(body, "success")) {
          throw new Error("No success field in response");
        }

        if (
          !(
            typeof (body as { success: unknown }).success === "boolean" &&
            (body as { success: boolean }).success
          )
        ) {
          console.error(body);
          throw new Error(
            "Frontend app creation response has success flag set to false",
          );
        }

        if (environment === "development") {
          console.log("Received response: ", body);
        }
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to create new frontend application",
          description:
            e instanceof Error ? e.message : `Failed to send network request`,
        });
        return;
      }

      toast({
        variant: "default",
        title: "Created new frontend client application successfully",
      });
      clearFrontendAppsCache(mutate);
      return;
    })
    return;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <AppWindow className="h-4 w-4 mr-2" /> Create app
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Create a new application</DialogTitle>
              <DialogDescription>
                Create a new frontend/client application which can access
                SchemaVaults APIs.
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="app_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>App Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={"My New React App"}
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Give a user-friendly name to the new application.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="app_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="This app connects to my new API"
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe what this app does.
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
                      disabled={submitting}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormDescription className="w-full">
                    Is this app publicly listed to end-users? I.e. can they find
                    it without having authorized it first
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                <AppWindow className="h-4 w-4 mr-2" />
                Create client application
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
