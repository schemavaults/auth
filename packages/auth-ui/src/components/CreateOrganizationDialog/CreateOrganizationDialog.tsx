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
import { type ReactElement, useMemo, useState, useTransition } from "react";

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
  type OrganizationDefinition,
  organizationDefinitionSchema,
} from "@schemavaults/auth-common";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2 } from "lucide-react";

interface CreateOrganizationDialogProps {
  clearOrganizationsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
}

const createOrganizationDialogContentId: string =
  "create-organization-dialog-content";
const openOrganizationCreationDialogButtonId: string =
  "open-create-organization-dialog-button";

export function CreateOrganizationDialog({
  clearOrganizationsCache,
}: CreateOrganizationDialogProps): ReactElement {
  const [open, setOpen] = useState<boolean>(false);
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
          throw new Error(
            `Organization creation request has bad status: ${response.status}`,
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
        title: "Created new organization successfully",
      });
      clearOrganizationsCache(mutate);
      setOpen(false);
      return;
    });
    return;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button id={openOrganizationCreationDialogButtonId}>
          <Building2 className="h-4 w-4 mr-2" /> Create organization
        </Button>
      </DialogTrigger>
      <DialogContent
        id={createOrganizationDialogContentId}
        className="sm:max-w-[425px]"
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Create a new organization</DialogTitle>
              <DialogDescription>
                Create a new organization to group users and resources together.
              </DialogDescription>
            </DialogHeader>
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
                    />
                  </FormControl>
                  <FormDescription>
                    A user-friendly display name for the organization.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                id="submit-create-organization-form-button"
                type="submit"
                disabled={submitting}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Create organization
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
