"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
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
import { Copy, KeyRound, RefreshCw, ShieldOff } from "lucide-react";

export interface AppClientSecretCardProps {
  app_id: AppId;
  has_client_secret: boolean;
  /** First generation time (ms since epoch), when a secret exists. */
  created_at: number | null;
  /** Last generation/rotation time (ms since epoch), when a secret exists. */
  updated_at: number | null;
  /** Whether the viewer may generate/rotate/remove the secret. */
  canManage: boolean;
}

/**
 * Management card for a client application's OAuth2/OIDC client secret.
 * Apps with a secret are confidential clients: the token endpoints
 * require the secret (client_secret_basic or client_secret_post) on
 * every token request. The plaintext secret is displayed exactly once
 * after generation/rotation.
 */
export const AppClientSecretCard: FC<AppClientSecretCardProps> = ({
  app_id,
  has_client_secret,
  created_at,
  updated_at,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function runSecretMutation(
    action: "generate" | "rotate" | "remove",
  ): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        if (action === "remove") {
          await authClient.deleteClientApplicationSecret(app_id);
          setGeneratedSecret(null);
          toast({
            variant: "default",
            title: "Client secret removed",
            description: "This app is now a public client again.",
          });
        } else {
          const result =
            action === "generate"
              ? await authClient.generateClientApplicationSecret(app_id)
              : await authClient.rotateClientApplicationSecret(app_id);
          setGeneratedSecret(result.client_secret);
          toast({
            variant: "default",
            title:
              action === "generate"
                ? "Client secret generated"
                : "Client secret rotated",
            description: "Copy the secret now - it will not be shown again.",
          });
        }
        router.refresh();
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title:
            action === "remove"
              ? "Failed to remove client secret"
              : "Failed to generate client secret",
          description:
            e instanceof Error ? e.message : "Failed to send network request",
        });
      }
    });
  }

  async function copySecretToClipboard(): Promise<void> {
    if (!generatedSecret) return;
    try {
      await navigator.clipboard.writeText(generatedSecret);
      toast({ variant: "default", title: "Client secret copied to clipboard" });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to copy client secret to clipboard",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Client Secret
        </CardTitle>
        <CardDescription>
          {has_client_secret
            ? "This app is a confidential OAuth2/OIDC client: token requests must authenticate with the client secret."
            : "This app is a public OAuth2/OIDC client (PKCE only). Generate a client secret to require client authentication at the token endpoints."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {has_client_secret && (
          <div className="space-y-1 text-sm">
            {typeof created_at === "number" && (
              <div className="flex flex-row gap-2">
                <span className="font-medium">Created:</span>
                <LocalDateTime
                  value={created_at}
                  showSeconds={false}
                  className="text-muted-foreground"
                />
              </div>
            )}
            {typeof updated_at === "number" && (
              <div className="flex flex-row gap-2">
                <span className="font-medium">Last rotated:</span>
                <LocalDateTime
                  value={updated_at}
                  showSeconds={false}
                  className="text-muted-foreground"
                />
              </div>
            )}
          </div>
        )}

        {generatedSecret && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
            <p className="text-sm font-medium">
              Save this client secret now - it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs"
                data-testid="generated-client-secret"
              >
                {generatedSecret}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy client secret"
                onClick={() => void copySecretToClipboard()}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-row flex-wrap gap-2">
            {!has_client_secret ? (
              <Button
                disabled={busy}
                onClick={() => runSecretMutation("generate")}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Generate client secret
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmRotate(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rotate secret
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirmRemove(true)}
                >
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Remove secret
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate client secret?</AlertDialogTitle>
            <AlertDialogDescription>
              A new client secret will be generated and the current secret
              will stop working immediately. Any deployment using the current
              secret must be updated with the new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => runSecretMutation("rotate")}
            >
              Rotate secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove client secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The client secret will be deleted and this app will become a
              public client again: token requests will no longer require
              client authentication. Any deployment still sending the secret
              will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => runSecretMutation("remove")}
            >
              Remove secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default AppClientSecretCard;
