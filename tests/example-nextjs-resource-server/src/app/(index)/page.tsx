import "server-only";
import Link from "next/link";
import type { ReactElement } from "react";
import { Button } from "@schemavaults/ui";
import { getSchemavaultsClientApplicationId } from "@schemavaults/auth-server-sdk";
import { ClientAppsCallout } from "./client-apps-callout";
import { DemoCard } from "./demo-card";
import { DemoGroup } from "./demo-group";

function confidentialClientId(): string | null {
  const value: string | undefined = process.env.OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The home page: every demo, grouped by the client app it signs in as.
 *
 * The E2E suite starts most specs here: keep the `h1`, the "Login" and
 * "Register" buttons (real `<button>`s, selected with `cy.contains("button",
 * ...)`), and the `data-testid`s of the links it clicks.
 */
export default function IndexPage(): ReactElement {
  const publicClientId: string = getSchemavaultsClientApplicationId();
  const confidentialId: string | null = confidentialClientId();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
          @schemavaults/example-nextjs-resource-server
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          An example Next.js app and API that signs its users in with a SchemaVaults auth server. Each demo
          integrates a different way. They are grouped by the client app they sign in as.
        </p>
      </section>

      <ClientAppsCallout publicClientId={publicClientId} confidentialClientId={confidentialId} />

      <DemoGroup
        id="public-client"
        title="Public client"
        description="No client secret: PKCE alone protects these sign-ins."
        clientApp={{ envVar: "SCHEMAVAULTS_CLIENT_APP_ID", appId: publicClientId }}
      >
        <DemoCard
          id="sdk-sign-in"
          title="SDK sign-in"
          actions={
            <>
              <Link href="/auth/login">
                <Button>Login</Button>
              </Link>
              <Link href="/auth/register">
                <Button variant="outline">Register</Button>
              </Link>
            </>
          }
        >
          Sign in with the SchemaVaults SDKs. This app&apos;s session routes keep the refresh token in an
          HttpOnly cookie on its own domain, and the account page calls the protected API with an access
          token.
        </DemoCard>
        <DemoCard
          id="openid-client"
          title="openid-client"
          actions={
            <>
              {/* A route handler: a plain anchor makes a full document
                  navigation instead of a client-side transition. */}
              <a href="/openid-client/login" data-testid="openid-client-login-link">
                <Button>Sign in with openid-client</Button>
              </a>
              <Button asChild variant="ghost">
                <Link href="/openid-client/profile">View profile</Link>
              </Button>
            </>
          }
        >
          Standard OpenID Connect with the off-the-shelf <code>openid-client</code> package and no
          SchemaVaults SDK: the authorization code flow with PKCE.
        </DemoCard>
      </DemoGroup>

      <DemoGroup
        id="confidential-client"
        title="Confidential client"
        description="Authenticates with its client secret, which stays on this server."
        clientApp={{ envVar: "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID", appId: confidentialId }}
      >
        <DemoCard
          id="confidential-client"
          title="openid-client, confidential"
          actions={
            <>
              <a href="/openid-client-confidential/login" data-testid="openid-client-confidential-login-link">
                <Button>Sign in with openid-client</Button>
              </a>
              <Button asChild variant="ghost">
                <Link href="/openid-client-confidential/profile">View profile</Link>
              </Button>
            </>
          }
        >
          The same openid-client flow as a confidential client: the token request also presents the
          app&apos;s client secret (<code>client_secret_basic</code>) on top of PKCE.
        </DemoCard>
        <DemoCard
          id="agents"
          title="Agent sessions"
          actions={
            <a href="/agents" data-testid="agents-link">
              <Button>Open agent sessions</Button>
            </a>
          }
        >
          Agents that act for you with delegated tokens (RFC 8693). Each session runs in a sandbox in your
          browser with a token narrowed to the scopes you pick, and you can revoke it at any time.
        </DemoCard>
      </DemoGroup>

      <DemoGroup id="api" title="API" description="This app's own API, protected by the auth server's access tokens.">
        <DemoCard
          id="api-docs"
          title="API reference"
          actions={
            <>
              <Link href="/docs" data-testid="api-docs-link">
                <Button>API documentation</Button>
              </Link>
              <Button asChild variant="ghost">
                <a href="/api/openapi.json">OpenAPI document</a>
              </Button>
            </>
          }
        >
          Generated from the API&apos;s <code>@schemavaults/openapi-operations</code> declarations, with the
          permissions each operation requires.
        </DemoCard>
      </DemoGroup>
    </main>
  );
}
