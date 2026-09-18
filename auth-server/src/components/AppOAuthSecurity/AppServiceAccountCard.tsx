"use client";

import { useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { AppId } from "@schemavaults/app-definitions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { Bot, Trash2 } from "lucide-react";

export interface AppServiceAccountCardProps {
  app_id: AppId;
  /** Null until the first client_credentials grant or explicit creation. */
  service_account: {
    uid: string;
    email: string;
    created_at: number;
    disabled: boolean;
  } | null;
  /** Whether the app is a confidential client (may use the grant). */
  has_client_secret: boolean;
  /** Whether the viewer may create/remove the service account. */
  canManage: boolean;
}

/**
 * Management card for a client application's service account: the
 * machine identity that access tokens obtained through the OAuth2
 * client_credentials grant are issued to. The grant is only available
 * to confidential clients, so the card points at the client secret card
 * when the app has none.
 */
export const AppServiceAccountCard: FC<AppServiceAccountCardProps> = ({
  app_id,
  service_account,
  has_client_secret,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  function runMutation(action: "create" | "remove"): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        if (action === "create") {
          const result =
            await authClient.createClientApplicationServiceAccount(app_id);
          toast({
            variant: "default",
            title: result.created
              ? "Service account created"
              : "Service account already exists",
            description: result.message,
          });
        } else {
          await authClient.deleteClientApplicationServiceAccount(app_id);
          toast({
            variant: "default",
            title: "Service account removed",
            description:
              "The next client credentials grant will create a new one.",
          });
        }
        router.refresh();
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title:
            action === "create"
              ? "Failed to create service account"
              : "Failed to remove service account",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
      }
    });
  }

  return (
    <Card data-testid="app-service-account-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Service Account
        </CardTitle>
        <CardDescription>
          Machine-to-machine access tokens obtained with the OAuth2 client
          credentials grant (<code>grant_type=client_credentials</code>) are
          issued to this app&apos;s service account instead of a user.
          {!has_client_secret &&
            " The grant requires a confidential client: generate a client secret first."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {service_account ? (
          <div className="space-y-1 text-sm">
            <div className="flex flex-row flex-wrap gap-2">
              <span className="font-medium">Subject (uid):</span>
              <code
                className="break-all rounded bg-muted px-1 text-xs"
                data-testid="service-account-uid"
              >
                {service_account.uid}
              </code>
            </div>
            <div className="flex flex-row flex-wrap gap-2">
              <span className="font-medium">Email:</span>
              <span className="text-muted-foreground break-all">
                {service_account.email}
              </span>
            </div>
            <div className="flex flex-row gap-2">
              <span className="font-medium">Created:</span>
              <LocalDateTime
                value={service_account.created_at}
                showSeconds={false}
                className="text-muted-foreground"
              />
            </div>
            {service_account.disabled && (
              <p className="text-destructive">
                This service account is disabled: client credentials grants
                are refused.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No service account yet. One is created automatically by the first
            successful client credentials grant, or create it now to grant its
            id permissions ahead of time.
          </p>
        )}

        {canManage && (
          <div className="flex flex-row flex-wrap gap-2">
            {!service_account ? (
              <Button disabled={busy} onClick={() => runMutation("create")}>
                <Bot className="h-4 w-4 mr-2" />
                Create service account
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={busy}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove service account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove service account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The service account and its token records will be
                      deleted. Access tokens already issued to it remain valid
                      until they expire. The next client credentials grant
                      creates a new service account with a different id, so
                      any permissions granted to the current id on resource
                      servers will no longer apply.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={busy}
                      onClick={() => runMutation("remove")}
                    >
                      Remove service account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AppServiceAccountCard;
