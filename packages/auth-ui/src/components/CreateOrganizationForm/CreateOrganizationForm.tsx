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
  type FC,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useTransition,
  type ReactElement,
} from "react";

import { useForm } from "@schemavaults/ui";
import { useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type OrganizationDefinition,
  organizationDefinitionSchema,
  type OrganizationID,
} from "@schemavaults/auth-common";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2 } from "lucide-react";

export interface CreateOrganizationFormProps {
  onSuccess: (organization_id: string) => void;
  FooterWrapper?: FC<PropsWithChildren>;
}

export function CreateOrganizationForm({
  onSuccess,
  ...props
}: CreateOrganizationFormProps): ReactElement {
  const FooterWrapper: FC<PropsWithChildren> = useMemo(() => {
    if (typeof props.FooterWrapper === "function") {
      return props.FooterWrapper;
    } else {
      return function DefaultBlankFooterWrapper({
        children,
      }: PropsWithChildren): ReactElement {
        return <>{children}</>;
      };
    }
  }, [props.FooterWrapper]);

  const { toast } = useToast();

  const defaultValues: Partial<OrganizationDefinition> = useMemo(() => {
    return {
      organization_id: "",
      name: "",
      created_at: Date.now(),
    };
  }, []);

  const form = useForm<OrganizationDefinition>({
    resolver: zodResolver(organizationDefinitionSchema),
    defaultValues,
  });
  const environment = useAppEnvironment();
  const { mutate } = useSWRConfig();
  const [submitting, startSubmitting] = useTransition();

  const clearOrganizationsCache = useCallback((): void => {
    mutate("/api/organizations");
  }, [mutate]);

  async function onSubmit(values: OrganizationDefinition): Promise<void> {
    if (environment === "development") {
      console.log("Submitting organization creation form...");
      toast({
        variant: "default",
        title: "Submitting organization creation form...",
      });
    }

    startSubmitting(async () => {
      try {
        const response = await fetch("/api/organizations", {
          method: "POST",
          body: JSON.stringify({
            ...values,
            created_at: Date.now(),
          }),
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          try {
            const body = await response.json();
            if (typeof body === "object" && body) {
              if ("error" in body && typeof body.error === "string") {
                throw new Error(
                  `${response.status} ${response.statusText} - ${body.error}`,
                );
              }
            } else if ("message" in body && typeof body.message === "string") {
              throw new Error(
                `${response.status} ${response.statusText} - ${body.message}`,
              );
            }
          } catch (e: unknown) {
            if (
              e instanceof Error &&
              e.message.startsWith(`${response.status} ${response.statusText}`)
            ) {
              throw e;
            }
          }
          throw new Error(
            `Organization creation request has bad status: ${response.status} ${response.statusText}`,
          );
        }

        const body: object = await response.json();
        if (typeof body !== "object") {
          throw new Error(
            "Expected JSON object response from organization creation attempt",
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
            "Organization creation response has success flag set to false",
          );
        }

        if (environment === "development") {
          console.log("Received response: ", body);
        }
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to create new organization",
          description:
            e instanceof Error ? e.message : `Failed to send network request`,
        });
        return;
      }

      toast({
        variant: "default",
        title: "Created new organization successfully!",
        description: `The organization '${values.organization_id satisfies OrganizationID}' should now exist.`,
      });
      clearOrganizationsCache();
      form.reset();
      onSuccess(values.organization_id satisfies OrganizationID);
      return;
    });
    return;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (e): void => {
          console.warn(
            "Failed to validate create organization form inputs: ",
            e,
          );
          toast({
            variant: "destructive",
            title: "Failed to validate create organization form inputs",
            description: "See console for full error message",
          });
        })}
        className="flex flex-col justify-start gap-4"
      >
        <FormField
          control={form.control}
          name="organization_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization ID</FormLabel>
              <FormControl>
                <Input
                  placeholder={"my-organization"}
                  {...field}
                  disabled={submitting}
                />
              </FormControl>
              <FormDescription>
                A unique identifier for the organization. Must start with a
                letter, contain only lowercase letters, numbers, hyphens and
                underscores.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="My Organization"
                  {...field}
                  disabled={submitting}
                  autoComplete="organization"
                />
              </FormControl>
              <FormDescription>
                A user-friendly display name for the organization.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FooterWrapper>
          <Button
            id="submit-create-organization-form-button"
            type="submit"
            disabled={submitting}
          >
            <Building2 className="h-4 w-4 mr-2" />
            Create organization
          </Button>
        </FooterWrapper>
      </form>
    </Form>
  );
}

export default CreateOrganizationForm;
