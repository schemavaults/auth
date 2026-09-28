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
import { type ReactElement, useMemo, useState, useTransition } from "react";

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
  type RequestedResourceOwnership,
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppWindow } from "lucide-react";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";
import { requestedOwnershipToDefinitionFields } from "@/components/CreateAppDialog/requested-ownership-fields";
import {
  ResourceOwnershipPicker,
  describeRequestedResourceOwnership,
  resourceOwnershipSelectionToRequestedOwnership,
  useResourceOwnershipChoices,
  useResourceOwnershipSelection,
  type CreateResourceOwnershipOptions,
  type ResourceOwnershipSelection,
} from "@/components/ResourceOwnershipPicker";

export interface CreateAppFormProps {
  /**
   * Which owners the form's "Owner" field offers (the platform for admins,
   * organizations the user administers, the user's own account) and which
   * one it preselects (derived from where the form was opened).
   */
  ownership: CreateResourceOwnershipOptions;
  clearFrontendAppsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  onSuccess: () => void;
  uuid: () => string;
}

export default function CreateAppForm({
  ownership,
  clearFrontendAppsCache,
  onSuccess,
  uuid,
}: CreateAppFormProps): ReactElement {
  const friendlyName: string = useAuthUiFriendlyName();
  const { choices, currentUserUid } = useResourceOwnershipChoices(ownership);
  const { selection, setSelection } = useResourceOwnershipSelection(
    ownership.defaultOwnership,
    choices,
  );
  const [organizationError, setOrganizationError] = useState<
    string | undefined
  >(undefined);
  const defaultValues: Partial<SchemaVaultsApp> = useMemo(() => {
    return {
      app_name: "",
      app_id: uuid(),
      app_description: "",
      public: false,
      web: true,
      created_at: Date.now(),
      hardcoded: false,
    };
  }, [uuid]);

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

    const requestedOwnership: RequestedResourceOwnership | null = selection
      ? resourceOwnershipSelectionToRequestedOwnership(
          selection,
          currentUserUid,
        )
      : null;
    if (!requestedOwnership) {
      if (selection?.owner_type === "organization") {
        setOrganizationError(
          "Choose the organization that will own this app.",
        );
        return;
      }
      toast({
        variant: "destructive",
        title: "Choose who will own this app",
      });
      return;
    }

    startSubmitting(async () => {
      const authClient = auth.ready ? auth.client.current : undefined;

      const createAppRequestBody: Partial<SchemaVaultsApp> = {
        ...values,
        // The owner comes from the "Owner" field only.
        ...requestedOwnershipToDefinitionFields(requestedOwnership),
      };

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
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.createClientApplication(
          validatedAppRequestBody.data satisfies SchemaVaultsApp,
        );
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
        description: describeRequestedResourceOwnership(
          requestedOwnership,
          choices,
          friendlyName,
        ),
      });
      clearFrontendAppsCache(mutate);
      onSuccess();
      form.reset({ ...defaultValues, app_id: uuid() });
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
            Create a new frontend/client application which can access{" "}
            {friendlyName} APIs.
          </DialogDescription>
        </DialogHeader>
        <ResourceOwnershipPicker
          id="create-app-owner"
          resourceKind="app"
          choices={choices}
          value={selection}
          onValueChange={(next: ResourceOwnershipSelection): void => {
            setSelection(next);
            setOrganizationError(undefined);
          }}
          disabled={submitting}
          organizationError={organizationError}
        />
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
          name="app_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>App ID</FormLabel>
              <FormControl>
                <Input
                  placeholder={"my-new-react-app"}
                  {...field}
                  disabled={submitting}
                />
              </FormControl>
              <FormDescription>
                A unique identifier for the application. Must start with a
                lowercase letter or number, and contain only lowercase letters,
                numbers, hyphens, and underscores. Defaults to a randomly
                generated ID.
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
        <FormField
          control={form.control}
          name="web"
          render={({ field }) => (
            <FormItem className="flex flex-row gap-2 items-center flex-wrap">
              <FormLabel className="w-full">Web Application?</FormLabel>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={submitting}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormDescription className="w-full">
                Is this a web application? Web apps receive authorization codes
                via URL redirect. Native/desktop apps receive codes via a POST
                request.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            id="submit-create-app-form-button"
            type="submit"
            disabled={submitting || !selection}
          >
            <AppWindow className="h-4 w-4 mr-2" />
            Create client application
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
