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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useForm,
} from "@schemavaults/ui";
import { useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type OrganizationID,
  SCHEMAVAULTS_ORGANIZATION_ID,
} from "@schemavaults/auth-common";
import {
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppWindow } from "lucide-react";

export interface CreateAppFormProps {
  owner_organization_id: OrganizationID;
  clearFrontendAppsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  onSuccess: () => void;
  uuid: () => string;
}

export default function CreateAppForm({
  owner_organization_id,
  clearFrontendAppsCache,
  onSuccess,
  uuid,
}: CreateAppFormProps): ReactElement {
  const defaultValues: Partial<SchemaVaultsApp> = useMemo(() => {
    return {
      app_name: "",
      app_id: uuid(),
      app_description: "",
      public: false,
      created_at: Date.now(),
      hardcoded: false,
      owner_organization_id,
    };
  }, [owner_organization_id, uuid]);

  const form = useForm<SchemaVaultsApp>({
    resolver: zodResolver(schemaVaultsAppDefinitionSchema),
    defaultValues,
  });

  const { toast } = useToast();

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

      const createAppRequestBody: Partial<SchemaVaultsApp> = {
        ...values,
      };

      if (typeof owner_organization_id === "string") {
        createAppRequestBody["owner_organization_id"] = owner_organization_id;
      } else if (!owner_organization_id && authClient?.currentUser?.admin) {
        createAppRequestBody["owner_organization_id"] =
          SCHEMAVAULTS_ORGANIZATION_ID;
      }

      // if we're creating it from this form then it must be non-hardcoded/dynamic...
      createAppRequestBody["hardcoded"] = false;
      createAppRequestBody["created_at"] = Date.now();

      const validatedAppRequestBody =
        await schemaVaultsAppDefinitionSchema.safeParseAsync(
          createAppRequestBody,
        );
      if (!validatedAppRequestBody.success) {
        console.error(
          "Failed to prepare application creation request:",
          validatedAppRequestBody.error,
        );
        toast({
          variant: "destructive",
          title: "Failed to prepare application creation request",
          description:
            "See your console for the full validation error message!",
        });
        return;
      }

      try {
        const response = await fetch("/api/apps", {
          method: "POST",
          body: JSON.stringify(
            validatedAppRequestBody.data satisfies SchemaVaultsApp,
          ),
          credentials: "include",
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
      onSuccess();
      form.reset();
      return;
    });
    return;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (e) => {
          console.error(e);
          toast({
            variant: "destructive",
            title: "Failed to validate create app form inputs",
            description: "See console for full error message",
          });
        })}
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
              <FormDescription>Describe what this app does.</FormDescription>
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
                Is this app publicly listed to end-users? I.e. can they find it
                without having authorized it first
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            id="submit-create-app-form-button"
            type="submit"
            disabled={submitting}
          >
            <AppWindow className="h-4 w-4 mr-2" />
            Create client application
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
