"use client";

import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";
import type { useToast } from "@schemavaults/ui";

interface SendAuthorizeFrontendAppRequestOpts {
  toast: ReturnType<typeof useToast>["toast"];
  auth: ISchemaVaultsAuthClient;
  app_id: string;
}

export async function sendAuthorizeFrontendAppRequest({
  auth,
  app_id,
  toast,
}: SendAuthorizeFrontendAppRequestOpts) {
  if (typeof app_id !== "string") {
    throw new Error("Expected app to authorize's id to be a string");
  }

  try {
    await auth.sendAuthorizeClientApplicationRequest(app_id);
  } catch (e: unknown) {
    toast({
      variant: "destructive",
      title: "Error sending authorize app request",
      description:
        e instanceof Error ? e.message : `Failed to send network request`,
    });
    return;
  }

  toast({
    variant: "default",
    title: "Successfully authorized application",
    description: "You should now be able to log in through it",
  });
  return;
}

export default sendAuthorizeFrontendAppRequest;
