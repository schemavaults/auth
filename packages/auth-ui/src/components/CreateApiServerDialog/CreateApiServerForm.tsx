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
import { useMemo, type ReactElement } from "react";

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
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server } from "lucide-react";
import type { OrganizationID } from "@schemavaults/auth-common";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";

interface CreateApiServerFormProps {
  clearApiServersCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  owner_organization_id: OrganizationID;
  uuid: () => string;
  onSuccess: () => void;
}

export function CreateApiServerForm({
  clearApiServersCache,
  owner_organization_id,
  uuid,
  onSuccess,
}: CreateApiServerFormProps): ReactElement {
  const { toast } = useToast();
  const friendlyName: string = useAuthUiFriendlyName();

  const defaultValues: Partial<SchemaVaultsApiServerDefinition> =
    useMemo(() => {
      return {
        api_server_name: "",
        api_server_id: uuid(),
        api_server_description: "",
        public: false,
        created_at: Date.now(),
        hardcoded: false,
        owner_organization_id,
      };
    }, [owner_organization_id, uuid]);

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
        owner_organization_id: owner_organization_id ?? null,
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
          <Button id="submit-create-api-server-form-button" type="submit">
            <Server className="h-4 w-4 mr-2" />
            Create Server Application
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default CreateApiServerForm;
