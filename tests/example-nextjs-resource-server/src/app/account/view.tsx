"use client";

import type { MouseEvent, ReactElement } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  useToast,
} from "@schemavaults/ui";
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

  /** Calls the protected `POST /api/ping` with an access token for this API. */
  async function pingProtectedApi(e: MouseEvent<HTMLButtonElement>): Promise<void> {
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
      response = await fetch(new URL("/api/ping", window.location.origin), {
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
          e instanceof Error ? e.message : "An unknown error has occurred!",
      });
      return;
    }
    console.log("Received successful pong response!");

    const body = await response.json();
    toast({
      title: "Received response from /api/ping!",
      description: JSON.stringify(body),
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            Example Account Page
          </h1>
          <CardDescription>
            SDK sign-in, as the public client. This page only renders for a
            signed-in user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            If you're seeing this it means that you were not redirected because
            you are logged in!
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <Link href="/" data-testid="account-home-link">
              ← Back to home
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button onClick={pingProtectedApi}>
              Fetch Protected /api/ping Route
            </Button>
            <Link href="/auth/logout">
              <Button variant="outline">Logout</Button>
            </Link>
          </div>
        </CardFooter>
      </Card>
    </main>
  );
}
