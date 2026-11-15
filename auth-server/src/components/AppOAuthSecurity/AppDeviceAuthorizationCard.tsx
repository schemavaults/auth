"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import type { AppId } from "@schemavaults/app-definitions";
import {
  Badge,
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
import { LocalDateTime } from "@schemavaults/auth-ui";
import { MonitorSmartphone } from "lucide-react";

export interface AppDeviceAuthorizationCardProps {
  app_id: AppId;
  /** Whether the app may use the grant now. */
  enabled: boolean;
  /** When it was enabled (ms since epoch); null when disabled. */
  enabled_at: number | null;
  /** Dynamically registered clients can never use the grant. */
  dynamically_registered: boolean;
  /** Whether the viewer may change the setting. */
  canManage: boolean;
}

/**
 * The app's OAuth 2.0 device authorization grant (RFC 8628) setting: whether
 * it may sign users in on devices that cannot show the login page (CLIs, TV
 * apps), who then approve the device's code on the auth server's `/device`
 * page. Off by default, because whoever starts a device flow chooses who is
 * shown its code.
 */
export const AppDeviceAuthorizationCard: FC<AppDeviceAuthorizationCardProps> = ({
  app_id,
  enabled: initially_enabled,
  enabled_at: initially_enabled_at,
  dynamically_registered,
  canManage,
}): ReactElement => {
  const { toast } = useToast();
  const auth = useAuth();
  const [busy, startTransition] = useTransition();
  const [enabled, setEnabled] = useState<boolean>(initially_enabled);
  const [enabledAt, setEnabledAt] = useState<number | null>(initially_enabled_at);

  function save(next: boolean): void {
    startTransition(async () => {
      // `client` exists on the auth context only once it is ready.
      const client = auth.ready ? auth.client.current : undefined;
      if (!client) {
        toast({ variant: "destructive", title: "Not ready", description: "Please try again in a moment." });
        return;
      }
      try {
        const policy = await client.setClientApplicationDeviceAuthorization(app_id, next);
        setEnabled(policy.enabled);
        setEnabledAt(policy.enabled_at);
        toast({
          title: policy.enabled ? "Device sign-in enabled" : "Device sign-in disabled",
          description: policy.enabled
            ? "Devices can now start sign-ins with this app's id."
            : "Device sign-in requests that were not completed yet were discarded.",
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to save",
          description: e instanceof Error ? e.message : "The setting could not be saved.",
        });
      }
    });
  }

  return (
    <Card data-testid="app-device-authorization-card">
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <MonitorSmartphone className="h-5 w-5" />
          Device sign-in
          {enabled ? <Badge variant="secondary">Enabled</Badge> : null}
        </CardTitle>
        <CardDescription>
          The OAuth 2.0 device authorization grant (RFC 8628), for apps that run where the login
          page cannot be shown, such as command-line tools and TV apps. The app asks for a short
          code, and the user approves it on this server&apos;s <code>/device</code> page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {dynamically_registered ? (
          <p className="text-sm text-muted-foreground">
            Dynamically registered clients cannot use device sign-in.
          </p>
        ) : (
          <>
            <div className="flex flex-row items-center gap-3">
              <Switch
                id={`device-authorization-${app_id}`}
                checked={enabled}
                disabled={!canManage || busy}
                onCheckedChange={(checked) => save(checked === true)}
                data-testid="app-device-authorization-switch"
              />
              <Label htmlFor={`device-authorization-${app_id}`}>
                Allow this app to use device sign-in
              </Label>
            </div>
            {enabled && enabledAt !== null ? (
              <p className="text-xs text-muted-foreground">
                Enabled <LocalDateTime value={enabledAt} />.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Only enable this for apps that need it: anyone who knows the app&apos;s id can start a
              device sign-in and ask a user to approve its code. Users are warned to approve only
              codes from devices they are setting up themselves. Disabling it discards the
              requests in progress.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AppDeviceAuthorizationCard;
