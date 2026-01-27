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
  Textarea,
  useToast,
} from "@schemavaults/ui";
import { useCallback, type ReactElement } from "react";

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useForm,
} from "@schemavaults/ui";
import { useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type InviteCodeDefinition,
  inviteCodeDefinitionSchema,
} from "@schemavaults/auth-common";
import { type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { SwatchBook } from "lucide-react";

export interface CreateInviteCodeFormProps {
  onSuccess: () => void;
}

export function CreateInviteCodeForm({
  onSuccess,
}: CreateInviteCodeFormProps): ReactElement {
  const { toast } = useToast();
  const form = useForm<InviteCodeDefinition>({
    resolver: zodResolver(inviteCodeDefinitionSchema),
    defaultValues: {
      invite_code: "",
      description: "",
      max_uses: 1,
      created_at: Date.now(),
    },
  });
  const { mutate } = useSWRConfig();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const clearInviteCodesCache = useCallback((): void => {
    mutate(
      (key): boolean =>
        typeof key === "string" && key.startsWith("/api/admin/invite-codes"),
      undefined,
      { revalidate: true },
    );
  }, [mutate]);

  async function onSubmit(values: InviteCodeDefinition): Promise<void> {
    if (environment === "development") {
      console.log("Submitting invite code creation form with values: ", values);
      toast({
        variant: "default",
        title: "Submitting invite code creation form...",
      });
    }
    const newInviteCode: InviteCodeDefinition = {
      ...values,
      created_at: Date.now(),
    };

    try {
      const response = await fetch(`/api/admin/invite-codes` as const, {
        method: "POST",
        body: JSON.stringify(newInviteCode),
        credentials: "include",
      });
      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Invite code creation request has bad status: ${response.status}`,
        );
      }

      const body: object = await response.json();
      if (typeof body !== "object") {
        throw new Error(
          "Expected JSON object response from invite code creation attempt",
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
          "Invite code creation response has success flag set to false",
        );
      }

      if (environment === "development") {
        console.log("Received response: ", body);
      }
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to create new invite code!",
        description:
          e instanceof Error ? e.message : `Failed to send network request`,
      });
      return;
    }

    toast({
      variant: "default",
      title: "Created new invite code successfully!",
      description: "New users should now be able to use it to register!",
    });
    clearInviteCodesCache();
    onSuccess();
    form.reset();
    return;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          function onSubmitInviteCodeCreationFormError(e: unknown): void {
            console.error(e);
            toast({
              variant: "destructive",
              title: "Failed to submit invite code creation form",
              description:
                "Failed to parse form into a valid invite code definition object!",
            });
          },
        )}
        className="flex flex-col justify-start gap-4"
      >
        <DialogHeader>
          <DialogTitle>Create a new invite code</DialogTitle>
          <DialogDescription>
            Create a new invite code for a new promotion or group of users.
          </DialogDescription>
        </DialogHeader>

        <FormField
          control={form.control}
          name="invite_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invite Code</FormLabel>
              <FormControl>
                <Input
                  placeholder={"BLAHBLAHBLAH420"}
                  {...field}
                  name="invite_code"
                />
              </FormControl>
              <FormDescription>Enter the new invite code.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={"e.g. Facebook Ad Campaign"}
                  {...field}
                  name="description"
                />
              </FormControl>
              <FormDescription>
                Describe the promotion or group this invite code is for.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="max_uses"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum # of Uses</FormLabel>
              <FormControl>
                <Input
                  placeholder={"99999"}
                  {...field}
                  name="max_uses"
                  onChange={(e): void => {
                    let asInt: number = e.target.valueAsNumber;
                    if (typeof asInt !== "number" || isNaN(asInt)) {
                      asInt = 1;
                    }
                    field.onChange(asInt);
                  }}
                  type="number"
                  step={1}
                  min={1}
                />
              </FormControl>
              <FormDescription>
                Limit usage of this code to a certain number of registrations.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" id="submit-create-invite-code-form-button">
            <SwatchBook className="h-4 w-4 mr-2" />
            Create new invite code
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default CreateInviteCodeForm;
