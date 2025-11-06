import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import type { AccessToken } from "@schemavaults/auth-common";
import { useAuth } from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";

interface SendAuthorizeFrontendAppRequestOpts {
  auth: ReturnType<typeof useAuth>;
  toast: ReturnType<typeof useToast>['toast'];
  app_id: string;
}

export async function sendAuthorizeFrontendAppRequest({ auth, toast, app_id }: SendAuthorizeFrontendAppRequestOpts) {
  if (typeof app_id !== 'string') throw new Error("Expected app to authorize's id to be a string");

  const authClient = auth.ready ? auth.client.current : undefined;
  if (!authClient) {
    toast({
      variant: 'destructive',
      title: "Auth client not ready",
      description: `Cannot acquire an access token yet`,
    });
    return;
  }

  let auth_access_jwt: AccessToken;
  try {
    const auth_jwt = await authClient.acquireAccessToken({
      token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id
    });
    if (!auth_jwt) throw new Error("Failed to acquire auth access token");
    auth_access_jwt = auth_jwt;
  } catch (e: unknown) {
    toast({
      variant: 'destructive',
      title: "Error loading authentication access token",
      description: e instanceof Error ? e.message : `Failed to prepare network request`,
    });
    return;
  }

  try {
    const response = await fetch("/api/apps/authorize", {
      method: "POST",
      headers: new Headers({
        'Authorization': `Bearer ${auth_access_jwt.token}`
      }),
      body: JSON.stringify({ app_id })
    })
    if (!response.ok || response.status !== 200) throw new Error("Received failure response from server");
  } catch (e: unknown) {
    toast({
      variant: 'destructive',
      title: "Error sending authorize app request",
      description: e instanceof Error ? e.message : `Failed to send network request`,
    });
    return;
  }

  toast({
    variant: 'default',
    title: "Successfully authorized application",
    description: "You should now be able to log in through it"
  });
}
