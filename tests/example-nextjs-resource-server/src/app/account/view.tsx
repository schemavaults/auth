"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { Button, useToast } from "@schemavaults/ui";
import {
  type ISchemaVaultsAuthClient,
  useAuth,
} from "@schemavaults/auth-react-provider";
import type { ApiServerId } from "@schemavaults/auth-server-sdk";

export interface IExampleAccountPageViewProps {
  api_server_id: ApiServerId;
}

export default function ExampleAccountPageView({
  api_server_id,
}: IExampleAccountPageViewProps): ReactElement {
  const { toast } = useToast();
  const authContext = useAuth();

  return (
    <main className="flex flex-col justify-start items-center gap-4 p-4">
      <h1 className="text-xl font-bold">
        @schemavaults/example-nextjs-resource-server
      </h1>
      <h2>Example Account Page</h2>
      <p>
        If you're seeing this it means that you were not redirected because you
        are logged in!
      </p>
      <Link href="/auth/logout">
        <Button>Logout</Button>
      </Link>
      <Button
        onClick={async (e) => {
          e.preventDefault();
          if (!authContext.ready || !authContext.client.current) {
            toast({
              variant: "destructive",
              title: "Auth context not ready!",
              description: "Cannot send test request!",
            });
            return;
          }
          const auth: ISchemaVaultsAuthClient = authContext.client.current;

          let response: Response;
          try {
            const accessToken = await auth.acquireAccessToken({
              audience: api_server_id,
            });
            response = await fetch(new URL("/api/ping"), {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken.token}`,
              },
              credentials: "include",
            });

            if (!response.ok || response.status !== 200) {
              throw new Error(
                `Bad response: ${response.status} ${response.statusText}`,
              );
            }
          } catch (e: unknown) {
            console.error(e);
            toast({
              variant: "destructive",
              title: "Failed to send POST request to /api/ping",
              description:
                e instanceof Error
                  ? e.message
                  : "An unknown error has occurred!",
            });
            return;
          }
          console.log("Received successful pong response!");

          const body = await response.json();
          toast({
            title: "Received response from /api/ping!",
            description: JSON.stringify(body),
          });
          return;
        }}
      >
        Fetch Protected /api/ping Route
      </Button>
    </main>
  );
}
