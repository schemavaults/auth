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
import {
  type ReactElement,
  useContext,
  useEffect,
  useMemo,
  useTransition,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  Label,
  useForm,
} from "@schemavaults/ui";
import { useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type ApiServerId,
  type SchemaVaultsApiServerDomainRef,
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironments,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { EarthLock } from "lucide-react";
import { CreateApiServerDomainDialogOpenContext } from "./CreateApiServerDomainDialogOpenContext";
import { getUseApiServerDomainsListEndpoint } from "@/components/ApiServersTable";

interface CreateApiServerDomainDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  uuid: () => string;
}

export function CreateApiServerDomainDialog({
  open,
  onOpenChange,
  uuid,
}: CreateApiServerDomainDialogProps): ReactElement {
  const { toast } = useToast();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const api_server_id: ApiServerId | false = useContext(
    CreateApiServerDomainDialogOpenContext,
  );

  const defaultValues: Partial<SchemaVaultsApiServerDomainRef> =
    useMemo(() => {
      return {
        api_server_id: typeof api_server_id === "string" ? api_server_id : "",
        domain: "",
        api_server_domain_ref_id: uuid(),
        environment,
        created_at: Date.now(),
        hardcoded: false, // if its being created by this form then its by definition dynamic
      };
    }, [environment, api_server_id, uuid]);

  const form = useForm<SchemaVaultsApiServerDomainRef>({
    resolver: zodResolver(schemaVaultsApiServerDomainRefSchema),
    defaultValues,
  });
  const auth = useAuth();
  const { mutate } = useSWRConfig();
  const [submitting, startSubmitting] = useTransition();

  // Reset form when selected API server changes
  useEffect(() => {
    if (
      typeof api_server_id === "string" &&
      form.getValues().api_server_id !== api_server_id
    ) {
      form.setValue("api_server_id", api_server_id);
    }
  }, [api_server_id, form]);

  async function onSubmit(
    values: SchemaVaultsApiServerDomainRef,
  ): Promise<void> {
    if (environment === "development") {
      console.log(
        "Submitting API server domain creation form with values: ",
        values,
      );
      toast({
        variant: "default",
        title: "Submitting API server domain creation form...",
      });
    }

    startSubmitting(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.createApiServerDomain({
          ...values,
          created_at: Date.now(),
          api_server_id: values.api_server_id,
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to attach domain to API server",
          description:
            e instanceof Error ? e.message : `Failed to send network request`,
        });
        return;
      }

      toast({
        variant: "default",
        title: "Created new API server domain successfully",
      });
      mutate(
        (key) =>
          key === getUseApiServerDomainsListEndpoint(values.api_server_id),
        undefined,
        { revalidate: true },
      );
      form.reset();
      onOpenChange(false);
    });

    return;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        id="create-api-server-domain-dialog-content"
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(
              function onValid(values): void {
                startSubmitting(async () => await onSubmit(values));
              },
              function onFormError(e): void {
                console.error("API server domain form errors: ", e);
                toast({
                  variant: "destructive",
                  title: "Create API server domain form has errors",
                });
              },
            )}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Create a new API server domain</DialogTitle>
              <DialogDescription>
                Register a new domain that this backend API server may be
                reached at.
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={"https://api.example.com"}
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    What is the base URL that this API server may be reached
                    at?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="environment"
              render={({ field }) => (
                <FormItem className="flex flex-row gap-2 items-center flex-wrap">
                  <FormLabel className="w-full">Environment</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                      disabled={field.disabled || submitting}
                      name={field.name}
                    >
                      {schemaVaultsAppEnvironments.map(
                        (app_env: SchemaVaultsAppEnvironment) => {
                          const environment_radio_button_id: string = `api-server-domain-environment-radio-item-${app_env}`;
                          return (
                            <div
                              className="flex items-center space-x-2"
                              key={app_env}
                            >
                              <RadioGroupItem
                                value={app_env}
                                id={environment_radio_button_id}
                              />
                              <Label htmlFor={environment_radio_button_id}>
                                {app_env}
                              </Label>
                            </div>
                          );
                        },
                      )}
                    </RadioGroup>
                  </FormControl>
                  <FormDescription className="w-full">
                    What environments is this API server domain accessible
                    from? This allows restricting production environments to
                    only use a production domain over HTTPS.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting}
                id="submit-create-api-server-domain-form-button"
              >
                <EarthLock className="h-4 w-4 mr-2" />
                Create API server domain
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateApiServerDomainDialog;
