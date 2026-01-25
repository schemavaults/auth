import { useToast } from "@schemavaults/ui";

interface SendAuthorizeFrontendAppRequestOpts {
  toast: ReturnType<typeof useToast>['toast'];
  app_id: string;
}

export async function sendAuthorizeFrontendAppRequest({ toast, app_id }: SendAuthorizeFrontendAppRequestOpts) {
  if (typeof app_id !== 'string') throw new Error("Expected app to authorize's id to be a string");

  try {
    const response = await fetch("/api/apps/authorize", {
      method: "POST",
      body: JSON.stringify({ app_id }),
      credentials: "include",
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
