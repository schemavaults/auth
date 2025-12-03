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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useForm,
} from "@schemavaults/ui";
import { useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import {
  type InviteCodeDefinition,
  inviteCodeDefinitionSchema,
  type AccessToken,
} from "@schemavaults/auth-common";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { SwatchBook } from "lucide-react";

export function CreateInviteCodeDialog(): ReactElement {
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
  const auth = useAuth();
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

    const authClient = auth.ready ? auth.client.current : undefined;
    if (!authClient) {
      toast({
        variant: "destructive",
        title: "Auth client not ready",
        description: `Cannot acquire an access token yet`,
      });
      return;
    }

    let auth_access_jwt: AccessToken;
    try {
      const auth_jwt = await authClient.acquireAccessToken({
        token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      });
      if (!auth_jwt) throw new Error("Failed to acquire auth access token");
      auth_access_jwt = auth_jwt;
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error loading authentication access token",
        description:
          e instanceof Error ? e.message : `Failed to prepare network request`,
      });
      return;
    }

    try {
      const response = await fetch(`/api/admin/invite-codes/create` as const, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth_access_jwt.token}}`,
        },
        body: JSON.stringify(newInviteCode),
      });
      if (!response.ok || response.status !== 200) {
        throw new Error(
          `API server creation request has bad status: ${response.status}`,
        );
      }

      const body: object = await response.json();
      if (typeof body !== "object") {
        throw new Error(
          "Expected JSON object response from invite code creation attempt",
        );
      }

      if (!Object.hasOwn(body, 'success')) {
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
    return;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <SwatchBook className="h-4 w-4 mr-2" /> Create Invite Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
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
                    <Input placeholder={"BLAHBLAHBLAH420"} {...field} />
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
                    Limit usage of this code to a certain number of
                    registrations.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit">
                <SwatchBook className="h-4 w-4 mr-2" />
                Create new invite code
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
