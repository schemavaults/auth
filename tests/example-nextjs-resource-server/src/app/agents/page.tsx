import "server-only";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactElement } from "react";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@schemavaults/ui";
import { agentsConfigurationProblem } from "@/lib/agents/auth/agents-client";
import { AGENTS_SIGN_IN_HREF } from "@/lib/agents/auth/agents-sign-in";
import { readAgentsSignIn } from "@/lib/agents/auth/sign-in-cookie";
import { AGENT_SCOPE_OPTIONS } from "@/lib/agents/scopes";
import { AgentWorkspace } from "./agent-workspace";

export const metadata: Metadata = {
  title: "Agent sessions · SchemaVaults Auth example",
  description: "Agents that act for you, each in its own sandbox, with delegated tokens you control",
};

function BackToHome(): ReactElement {
  return (
    <Button asChild variant="ghost">
      <Link href="/" data-testid="agents-home-link">
        ← Back to home
      </Link>
    </Button>
  );
}

function NotConfigured({ problem }: { problem: string }): ReactElement {
  return (
    <main className="flex grow items-center justify-center p-4">
      <Card className="w-full max-w-lg" data-testid="agents-not-configured">
        <CardHeader>
          <CardTitle>Agent sessions are not set up here</CardTitle>
          <CardDescription>This deployment is missing configuration the agents app needs.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm" data-testid="agents-configuration-problem">
          {problem}
        </CardContent>
        <CardFooter>
          <BackToHome />
        </CardFooter>
      </Card>
    </main>
  );
}

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
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <BackToHome />
          {/* The confidential client's sign-in route (shared with the
              openid-client demo); a plain anchor makes a full document
              navigation to it. */}
          <a href={AGENTS_SIGN_IN_HREF} data-testid="agents-sign-in">
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
 * scoped to what the user picked. The sessions and their sandboxes run in
 * the user's browser; the server only reads the sealed sign-in cookie here
 * and mints or revokes the agents' tokens (actions.ts). See src/lib/agents/.
 */
export default async function AgentsPage(): Promise<ReactElement> {
  const problem = agentsConfigurationProblem();
  if (problem) return <NotConfigured problem={problem} />;
  const signIn = await readAgentsSignIn(await cookies());
  if (!signIn) return <SignedOut />;
  return (
    // The viewport below the site header (h-14: 3.5rem), so the workspace's
    // panes scroll inside it while the page's footer sits below.
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <AgentWorkspace
        ownerSub={signIn.sub}
        email={signIn.email}
        grantedScopes={signIn.scope.split(" ").filter((scope) => scope.length > 0)}
        scopeOptions={AGENT_SCOPE_OPTIONS}
      />
    </main>
  );
}
