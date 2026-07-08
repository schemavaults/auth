"use client";

import { type ReactElement, useContext, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  useForm,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { useSWRConfig } from "swr";
import { authorizeClientApplicationFormType } from "@schemavaults/auth-common";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AppId } from "@schemavaults/app-definitions";
import { AppWindow } from "lucide-react";
import { sendAuthorizeFrontendAppRequest } from "@/components/AppsTable/send-authorize-app-request";
import { clearUseAppsListCache } from "@/components/AppsTable/useAppsList";
import AuthorizeClientApplicationDialogOpenDispatchContext from "./AuthorizeClientApplicationDialogOpenDispatchContext";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";

interface AuthorizeAppFormValues {
  app_id: AppId;
}

interface AuthorizeClientApplicationDialogProps {
  open: boolean;
  onOpenChange: (val: boolean) => void;
}

export function AuthorizeClientApplicationDialog({
  open,
  onOpenChange,
}: AuthorizeClientApplicationDialogProps): ReactElement {
  const form = useForm<AuthorizeAppFormValues>({
    resolver: zodResolver(authorizeClientApplicationFormType),
    defaultValues: {
      app_id: "",
    },
  });

  const { toast } = useToast();
  const authContext = useAuth();
  const { mutate } = useSWRConfig();
  const [submitting, startSubmitting] = useTransition();
  const friendlyName: string = useAuthUiFriendlyName();

  async function onSubmit(values: AuthorizeAppFormValues): Promise<void> {
    startSubmitting(async () => {
      try {
        if (!authContext || !authContext.ready || !authContext.client.current) {
          throw new Error("Auth client is not ready!");
        }
        await sendAuthorizeFrontendAppRequest({
          toast,
          app_id: values.app_id,
          auth: authContext.client.current,
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to authorize application",
          description: e instanceof Error ? e.message : undefined,
        });
        return;
      }

      clearUseAppsListCache(mutate);
      onOpenChange(false);
      form.reset();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="authorize-app-dialog-content"
        className="sm:max-w-[425px]"
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (e) => {
              console.error(e);
              toast({
                variant: "destructive",
                title: "Failed to validate authorize app form inputs",
                description: "See console for full error message",
              });
            })}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Authorize an application</DialogTitle>
              <DialogDescription>
                Authorize a client application to access {friendlyName} APIs on
                your behalf by entering its app ID.
              </DialogDescription>
            </DialogHeader>
            <FormField
              control={form.control}
              name="app_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>App ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter application ID"
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    The unique identifier of the application you want to
                    authorize.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                id="submit-authorize-app-form-button"
                type="submit"
                disabled={submitting}
              >
                <AppWindow className="h-4 w-4 mr-2" />
                Authorize application
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function AuthorizeClientApplicationDialogTrigger(): ReactElement {
  const onOpenChange: (open: boolean) => void = useContext(
    AuthorizeClientApplicationDialogOpenDispatchContext,
  );

  return (
    <Button
      id="open-authorize-app-dialog-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <AppWindow className="h-4 w-4 mr-2" /> Authorize app
    </Button>
  );
}

export default AuthorizeClientApplicationDialog;
