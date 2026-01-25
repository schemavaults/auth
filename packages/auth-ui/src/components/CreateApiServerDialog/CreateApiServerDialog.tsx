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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useForm,
} from "@schemavaults/ui";
import { useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server } from "lucide-react";

interface CreateApiServerDialogProps {
  clearApiServersCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  owner_organization_id?: string | null;
}

function generateDefaultApiServerId(): string {
  try {
    return crypto.randomUUID();
  } catch (e: unknown) {
    console.error("Failed to generate default API server UUID: ", e);
    return "";
  }
}

export function CreateApiServerDialog({
  clearApiServersCache,
  owner_organization_id,
}: CreateApiServerDialogProps): ReactElement {
  const { toast } = useToast();

  const defaultValues: Partial<SchemaVaultsApiServerDefinition> =
    useMemo(() => {
      return {
        api_server_name: "",
        api_server_id: generateDefaultApiServerId(),
        api_server_description: "",
        public: false,
        created_at: Date.now(),
        hardcoded: false,
        owner_organization_id,
      };
    }, [owner_organization_id]);

  const form = useForm<SchemaVaultsApiServerDefinition>({
    resolver: zodResolver(schemaVaultsApiServerDefinitionSchema),
    defaultValues,
  });
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
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
      const response = await fetch("/api/apis", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          owner_organization_id: owner_organization_id ?? null,
        }),
        credentials: "include",
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
          "API server creation response has success flag set to false",
        );
      }

      if (environment === "development") {
        console.log("Received response: ", body);
      }
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
        <Button id="open-create-api-server-dialog-button">
          <Server className="h-4 w-4 mr-2" /> Create API
        </Button>
      </DialogTrigger>
      <DialogContent
        id="create-api-server-dialog-content"
        className="sm:max-w-[425px]"
      >
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
              <Button id="submit-create-api-server-form-button" type="submit">
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

export default CreateApiServerDialog;
