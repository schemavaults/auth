"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_RESOURCE_URL_MATCH_MODE,
  type ApiServerId,
  type ResourceUrlMatchMode,
} from "@schemavaults/app-definitions";
import {
  Button,
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
import { Bot } from "lucide-react";

export interface ApiServerDynamicClientsCardProps {
  api_server_id: ApiServerId;
  allow_dynamic_clients: boolean;
  resource_url_match_mode: ResourceUrlMatchMode;
  /** Whether the viewer may change the policy. */
  canManage: boolean;
}

/**
 * Management card for an API server's dynamic-client policy: whether
 * client applications registered anonymously through OAuth 2.0 Dynamic
 * Client Registration (RFC 7591, e.g. MCP clients) may request access
 * tokens for this API server as an RFC 8707 `resource` without an
 * explicit app-to-API connection, and how a `resource` URL is matched
 * against the server's registered domains.
 */
export const ApiServerDynamicClientsCard: FC<ApiServerDynamicClientsCardProps> = ({
  api_server_id,
  allow_dynamic_clients,
  resource_url_match_mode,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [allowDynamic, setAllowDynamic] = useState<boolean>(allow_dynamic_clients);
  const [matchMode, setMatchMode] = useState<ResourceUrlMatchMode>(
    resource_url_match_mode ?? DEFAULT_RESOURCE_URL_MATCH_MODE,
  );

  function save(update: {
    allow_dynamic_clients?: boolean;
    resource_url_match_mode?: ResourceUrlMatchMode;
  }): void {
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        const updated = await authClient.updateApiServerDynamicClientPolicy(
          api_server_id,
          update,
        );
        setAllowDynamic(updated.allow_dynamic_clients === true);
        setMatchMode(
          updated.resource_url_match_mode ?? DEFAULT_RESOURCE_URL_MATCH_MODE,
        );
        toast({
          variant: "default",
          title: "Dynamic client policy updated",
        });
        router.refresh();
      } catch (e: unknown) {
        console.error("Failed to update the dynamic client policy:", e);
        toast({
          variant: "destructive",
          title: "Failed to update the dynamic client policy",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <Card data-testid="api-server-dynamic-clients-card">
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <Bot className="h-5 w-5" />
          Dynamically Registered Clients
        </CardTitle>
        <CardDescription>
          Clients registered anonymously through OAuth 2.0 Dynamic Client
          Registration (RFC 7591), such as MCP clients, have no app-to-API
          connections. Opt in here to let them request access tokens for this
          API server by naming it as an OAuth <code>resource</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-row items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="allow-dynamic-clients-switch" className="font-medium">
              Allow dynamically registered clients
            </Label>
            <p className="text-sm text-muted-foreground">
              When on, any dynamically registered client a user has consented
              to may obtain tokens for this API server. Managed applications
              still need an explicit connection.
            </p>
          </div>
          <Switch
            id="allow-dynamic-clients-switch"
            checked={allowDynamic}
            disabled={!canManage || busy}
            onCheckedChange={(checked: boolean) => {
              setAllowDynamic(checked);
              save({ allow_dynamic_clients: checked });
            }}
          />
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="font-medium">Resource URL matching</p>
          <p className="text-sm text-muted-foreground">
            How a token request&apos;s <code>resource</code> URL is matched
            against this server&apos;s registered domains. <strong>Exact</strong>{" "}
            requires the URL to equal a registered domain;{" "}
            <strong>Prefix</strong> also accepts any URL under one (for
            example <code>https://api.example.com/mcp</code>). The issued
            token&apos;s <code>aud</code> is the URL the client sent.
          </p>
          <div className="flex flex-row flex-wrap gap-2 pt-1">
            {(["exact", "prefix"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={matchMode === mode ? "default" : "outline"}
                disabled={!canManage || busy}
                data-testid={`resource-url-match-mode-${mode}`}
                aria-pressed={matchMode === mode}
                onClick={() => {
                  if (matchMode === mode) return;
                  setMatchMode(mode);
                  save({ resource_url_match_mode: mode });
                }}
              >
                {mode === "exact" ? "Exact" : "Prefix"}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApiServerDynamicClientsCard;
