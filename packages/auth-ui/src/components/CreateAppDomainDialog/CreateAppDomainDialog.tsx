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
  AppId,
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironments,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { EarthLock } from "lucide-react";
import { CreateAppDomainDialogOpenContext } from "./CreateAppDomainDialogOpenContext";
import { getUseAppDomainsListEndpoint } from "@/components/AppsTable";

interface CreateFrontendAppDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  uuid: () => string;
}

export function CreateAppDomainDialog({
  open,
  onOpenChange,
  uuid,
}: CreateFrontendAppDialogProps): ReactElement {
  const { toast } = useToast();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const app_id: AppId | false = useContext(CreateAppDomainDialogOpenContext);

  const defaultValues: Partial<SchemaVaultsAppDomainRef> = useMemo(() => {
    return {
      app_id: typeof app_id === "string" ? app_id : "",
      domain: "",
      app_domain_ref_id: uuid(),
      environment,
      created_at: Date.now(),
      hardcoded: false, // if its being created by this form then its by definition dynamic
    };
  }, [environment, app_id, uuid]);

  const form = useForm<SchemaVaultsAppDomainRef>({
    resolver: zodResolver(schemaVaultsAppDomainRefSchema),
    defaultValues,
  });
  const auth = useAuth();
  const { mutate } = useSWRConfig();
  const [submitting, startSubmitting] = useTransition();

  // Reset form when selected app changes
  useEffect(() => {
    if (typeof app_id === "string" && form.getValues().app_id !== app_id) {
      form.setValue("app_id", app_id);
    }
  }, [app_id, form]);

  async function onSubmit(values: SchemaVaultsAppDomainRef): Promise<void> {
    if (environment === "development") {
      console.log(
        "Submitting frontend app domain creation form with values: ",
        values,
      );
      toast({
        variant: "default",
        title: "Submitting frontend app web domain creation form...",
      });
    }

    startSubmitting(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.createClientApplicationDomain({
          ...values,
          created_at: Date.now(),
          app_id: values.app_id,
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to attach domain to application",
          description:
            e instanceof Error ? e.message : `Failed to send network request`,
        });
        return;
      }

      toast({
        variant: "default",
        title: "Created new application domain successfully",
      });
      mutate(
        (key) => key === getUseAppDomainsListEndpoint(values.app_id),
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
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(
              function onValid(values): void {
                startSubmitting(async () => await onSubmit(values));
              },
              function onFormError(e): void {
                console.error("App domain form errors: ", e);
                toast({
                  variant: "destructive",
                  title: "Create app domain form has errors",
                });
              },
            )}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Create a new web app domain</DialogTitle>
              <DialogDescription>
                Create a new domain that can be redirected back to from a web
                PKCE auth flow.
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={"https://schemavaults.com"}
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    What URL can this app be reached at?
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
                          const environment_radio_button_id: string = `environment-radio-item-${app_env}`;
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
                    What environments is this app domain accessible from? This
                    allows restricting production environments to only use a
                    production domain over HTTPS.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                <EarthLock className="h-4 w-4 mr-2" />
                Create app domain
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateAppDomainDialog;
