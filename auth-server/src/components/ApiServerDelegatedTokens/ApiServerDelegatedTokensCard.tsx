"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { ApiServerId } from "@schemavaults/app-definitions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Switch,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { UserCog } from "lucide-react";

export interface ApiServerDelegatedTokensCardProps {
  api_server_id: ApiServerId;
  accept_delegated_tokens: boolean;
  /** Whether the viewer may change the policy (the API server's managers). */
  canManage: boolean;
}

/**
 * Management card for an API server's delegated-token policy: whether it
 * accepts access tokens whose RFC 8693 actor (`act`) claim names someone
 * acting on behalf of the user, such as a client app's agent. Off by
 * default; resource servers on @schemavaults/auth-server-sdk before 0.39.0
 * reject such tokens, so the API server's managers turn it on once theirs
 * is ready.
 */
export const ApiServerDelegatedTokensCard: FC<ApiServerDelegatedTokensCardProps> = ({
  api_server_id,
  accept_delegated_tokens,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [accept, setAccept] = useState<boolean>(accept_delegated_tokens);

  function save(next: boolean): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        const updated = await authClient.setApiServerDelegatedTokenPolicy(api_server_id, next);
        setAccept(updated.accept_delegated_tokens === true);
        toast({
          variant: "default",
          title: "Delegated token policy updated",
        });
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to update the delegated token policy:", e);
        setAccept(accept_delegated_tokens);
        toast({
          variant: "destructive",
          title: "Failed to update the delegated token policy",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <Card data-testid="api-server-delegated-tokens-card">
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <UserCog className="h-5 w-5" />
          Delegated Access (Agents)
        </CardTitle>
        <CardDescription>
          A delegated access token lets someone act on a user&apos;s behalf,
          such as an app&apos;s agent: the token is still the user&apos;s,
          with the user&apos;s granted scopes, and its RFC 8693{" "}
          <code>act</code> claim names who is acting. The auth server only
          mints delegated tokens for API servers that accept them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-row items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-2">
            <Label htmlFor="accept-delegated-tokens-switch" className="font-medium">
              Accept delegated tokens
            </Label>
            <p className="text-sm text-muted-foreground">
              Turn this on only once this API server runs{" "}
              <code>@schemavaults/auth-server-sdk</code> 0.39.0 or later
              (<code>@schemavaults/jwt</code> 0.16.0+): older versions reject
              every token that carries <code>act</code>. Route guards and
              principals then report the acting party as{" "}
              <code>actor</code>, and introspection as <code>act</code>, so
              your API can decide what an agent may do.
            </p>
            {canManage ? null : (
              <p className="text-sm font-medium text-muted-foreground">
                Only the API server&apos;s managers can change this setting.
              </p>
            )}
          </div>
          <Switch
            id="accept-delegated-tokens-switch"
            data-testid="accept-delegated-tokens-switch"
            checked={accept}
            disabled={!canManage || busy}
            onCheckedChange={(checked: boolean) => {
              setAccept(checked);
              save(checked);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ApiServerDelegatedTokensCard;
