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
import { type ReactElement, useMemo, useTransition } from "react";

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
import { useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironments,
} from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { EarthLock } from "lucide-react";

interface CreateFrontendAppDialogProps {
  clearFrontendWebAppDomainsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  app_id: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

export function CreateAppDomainDialog({
  clearFrontendWebAppDomainsCache,
  app_id,
  open,
  onOpenChange,
}: CreateFrontendAppDialogProps): ReactElement {
  const { toast } = useToast();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const defaultValues: Partial<SchemaVaultsAppDomainRef> = useMemo(() => {
    return {
      app_id,
      domain: "",
      app_domain_ref_id: "",
      environment,
      created_at: Date.now(),
    };
  }, [environment, app_id]);

  const form = useForm<SchemaVaultsAppDomainRef>({
    resolver: zodResolver(schemaVaultsAppDomainRefSchema),
    defaultValues,
  });
  const { mutate } = useSWRConfig();
  const [submitting, startSubmitting] = useTransition();

  async function onSubmit(values: SchemaVaultsAppDomainRef): Promise<void> {
    if (environment === "development") {
      console.log("Submitting frontend app creation form...");
      toast({
        variant: "default",
        title: "Submitting frontend app web domain creation form...",
      });
    }

    startSubmitting(async () => {
      try {
        const response = await fetch(`/api/apps/${app_id}/domains`, {
          method: "POST",
          body: JSON.stringify({
            ...values,
            created_at: Date.now(),
            app_id,
          }),
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Frontend app domain creation request has bad status: ${response.status}`,
          );
        }

        const body: object = await response.json();
        if (typeof body !== "object") {
          throw new Error(
            "Expected JSON object response from app domain creation attempt",
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
            "Frontend app domain creation response has success flag set to false",
          );
        }

        if (environment === "development") {
          console.log("Received response: ", body);
        }
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
      clearFrontendWebAppDomainsCache(mutate);
      onOpenChange(false);
    });

    return;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* <DialogTrigger asChild>
          <Button>
            <AppWindow className="h-4 w-4 mr-2" /> Create web app domain
          </Button>
        </DialogTrigger> */}
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
                      placeholder={"schemavaults.com"}
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
