import "server-only";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@schemavaults/ui";
import { getSignedInAgentUser } from "@/lib/agents/auth/signed-in-user";
import { listAgentSessions } from "@/lib/agents/runtime/agent-sessions";
import { AGENT_SCOPE_OPTIONS } from "@/lib/agents/scopes";
import { AgentWorkspace } from "./agent-workspace";

export const metadata: Metadata = {
  title: "Agent sessions · SchemaVaults Auth example",
  description: "Agents that act for you, each in its own sandbox, with delegated tokens you control",
};

function SignedOut(): ReactElement {
  return (
    <main className="flex grow items-center justify-center p-4">
      <Card className="w-full max-w-lg" data-testid="agents-signed-out">
        <CardHeader>
          <CardTitle>Agent sessions</CardTitle>
          <CardDescription>
            Start agents that act for you on this app&apos;s API. Each runs in its own sandbox with a
            delegated token: the API knows it is your agent and not you, it only gets the access you
            pick for the session, and you can revoke it at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Signing in asks you to let this app read your email address and your notes; each agent
          session then gets as much of that as you choose.
        </CardContent>
        <CardFooter>
          {/* A route handler: a plain anchor makes a full document navigation. */}
          <a href="/agents/login" data-testid="agents-sign-in">
            <Button>Sign in to start agent sessions</Button>
          </a>
        </CardFooter>
      </Card>
    </main>
  );
}

/**
 * /agents: the agent sessions example. A third-party app's view of
 * "auth for agents": the app signs the user in as a confidential client,
 * then gives each agent session a sandbox and a delegated token (RFC 8693)
 * scoped to what the user picked. See src/lib/agents/.
 */
export default async function AgentsPage(): Promise<ReactElement> {
  const user = await getSignedInAgentUser();
  if (!user) return <SignedOut />;
  return (
    <main className="flex h-[100dvh] flex-col">
      <AgentWorkspace
        email={user.email}
        grantedScopes={user.scope.split(" ").filter((scope) => scope.length > 0)}
        scopeOptions={AGENT_SCOPE_OPTIONS}
        initialSessions={listAgentSessions(user)}
      />
    </main>
  );
}
