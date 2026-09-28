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
import { useMemo, useState, type ReactElement } from "react";

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
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server } from "lucide-react";
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

interface CreateApiServerFormProps {
  clearApiServersCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  /**
   * Which owners the form's "Owner" field offers (the platform for admins,
   * organizations the user administers, the user's own account) and which
   * one it preselects (derived from where the form was opened).
   */
  ownership: CreateResourceOwnershipOptions;
  uuid: () => string;
  onSuccess: () => void;
}

export function CreateApiServerForm({
  clearApiServersCache,
  ownership,
  uuid,
  onSuccess,
}: CreateApiServerFormProps): ReactElement {
  const { toast } = useToast();
  const friendlyName: string = useAuthUiFriendlyName();
  const { choices, currentUserUid } = useResourceOwnershipChoices(ownership);
  const { selection, setSelection } = useResourceOwnershipSelection(
    ownership.defaultOwnership,
    choices,
  );
  const [organizationError, setOrganizationError] = useState<
    string | undefined
  >(undefined);

  const defaultValues: Partial<SchemaVaultsApiServerDefinition> =
    useMemo(() => {
      return {
        api_server_name: "",
        api_server_id: uuid(),
        api_server_description: "",
        public: false,
        created_at: Date.now(),
        hardcoded: false,
      };
    }, [uuid]);

  const form = useForm<SchemaVaultsApiServerDefinition>({
    resolver: zodResolver(schemaVaultsApiServerDefinitionSchema),
    defaultValues,
  });
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const auth = useAuth();
  const { mutate } = useSWRConfig();

  async function onSubmit(
    values: SchemaVaultsApiServerDefinition,
  ): Promise<void> {
    const requestedOwnership: RequestedResourceOwnership | null = selection
      ? resourceOwnershipSelectionToRequestedOwnership(
          selection,
          currentUserUid,
        )
      : null;
    if (!requestedOwnership) {
      if (selection?.owner_type === "organization") {
        setOrganizationError(
          "Choose the organization that will own this API server.",
        );
        return;
      }
      toast({
        variant: "destructive",
        title: "Choose who will own this API server",
      });
      return;
    }

    if (environment === "development") {
      console.log("Submitting API creation form...");
      toast({
        variant: "default",
        title: "Submitting API creation form...",
      });
    }

    try {
      const authClient = auth.ready ? auth.client.current : undefined;
      if (!authClient) {
        throw new Error("Auth client is not available");
      }
      await authClient.createApiServer({
        ...values,
        // The owner comes from the "Owner" field only.
        ...requestedOwnershipToDefinitionFields(requestedOwnership),
      });
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
      description: describeRequestedResourceOwnership(
        requestedOwnership,
        choices,
        friendlyName,
      ),
    });
    clearApiServersCache(mutate);
    form.reset({ ...defaultValues, api_server_id: uuid() });
    onSuccess();
    return;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (e: unknown) => console.error(e))}
        className="flex flex-col justify-start gap-4"
      >
        <DialogHeader>
          <DialogTitle>Create a new API server</DialogTitle>
          <DialogDescription>
            Create a new backend API server which {friendlyName} client
            applications can be authorized to access.
          </DialogDescription>
        </DialogHeader>
        <ResourceOwnershipPicker
          id="create-api-server-owner"
          resourceKind="api-server"
          choices={choices}
          value={selection}
          onValueChange={(next: ResourceOwnershipSelection): void => {
            setSelection(next);
            setOrganizationError(undefined);
          }}
          organizationError={organizationError}
        />
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
          name="api_server_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Server ID</FormLabel>
              <FormControl>
                <Input placeholder={"my-new-resource-server"} {...field} />
              </FormControl>
              <FormDescription>
                A unique identifier for the API server. Must start with a
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
                Is this API publicly listed to end-users? I.e. can they find it
                without having authorized a connected client application first?
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            id="submit-create-api-server-form-button"
            type="submit"
            disabled={!selection}
          >
            <Server className="h-4 w-4 mr-2" />
            Create Server Application
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default CreateApiServerForm;
