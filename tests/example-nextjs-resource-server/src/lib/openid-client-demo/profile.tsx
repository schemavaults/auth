// openid-client-demo/profile.tsx
//
// Shared rendering for the demo relying parties' profile pages.
//
// Displays the identity established by an openid-client demo sign-in
// flow (see ./config.ts). Reads the httpOnly session cookie written by
// the variant's callback route and renders the id_token + userinfo
// claims with stable data-testid hooks for the E2E suite. Each variant
// gets its own testid prefix so a spec can tell the public-client and
// confidential-client flows apart.
//
// The signed-in state offers a sign-out button, which POSTs to the
// variant's /logout route (see ./logout-handler.ts for why it is a form
// submission rather than a link, and for what RP-local sign-out does
// and does not clear). Both states link back to the home page.

import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactElement, ReactNode } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@schemavaults/ui";
import {
  getOpenidClientDemoConfig,
  type OpenidClientDemoConfig,
  type OpenidClientDemoSession,
  type OpenidClientDemoVariant,
} from "./config";
import { ProfileClaims } from "./profile-claims";

function parseSession(raw: string | undefined): OpenidClientDemoSession | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as OpenidClientDemoSession).sub === "string"
    ) {
      return parsed as OpenidClientDemoSession;
    }
  } catch {
    // fall through — treat an unparsable cookie as signed-out
  }
  return null;
}

/** The page around either state: the card, and the way back home. */
function ProfilePageShell({
  demo,
  heading,
  description,
  children,
  actions,
}: {
  demo: OpenidClientDemoConfig;
  heading: string;
  description: string;
  children: ReactNode;
  actions: ReactNode;
}): ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Card>
        <CardHeader>
          {/* The page's heading: an h1, where CardTitle would be an h3. */}
          <h1 className="text-xl font-semibold leading-tight tracking-tight">{heading}</h1>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <Link href="/" data-testid={`${demo.testIdPrefix}-home-link`}>
              ← Back to home
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </CardFooter>
      </Card>
    </main>
  );
}

export async function renderOpenidClientDemoProfilePage(
  variant: OpenidClientDemoVariant,
): Promise<ReactElement> {
  const demo: OpenidClientDemoConfig = getOpenidClientDemoConfig(variant);
  const heading: string =
    variant === "confidential"
      ? "OpenID Client Profile (confidential client)"
      : "OpenID Client Profile";
  const description: string =
    variant === "confidential"
      ? "Signed in with the openid-client package as the confidential client: the token request presented the app's client secret."
      : "Signed in with the openid-client package as the public client: PKCE, no client secret.";

  const cookieStore = await cookies();
  const session: OpenidClientDemoSession | null = parseSession(
    cookieStore.get(demo.sessionCookie)?.value,
  );

  if (!session) {
    return (
      <ProfilePageShell
        demo={demo}
        heading={heading}
        description={description}
        actions={
          // A route handler: a plain anchor makes a full document navigation.
          <a href={demo.loginPath}>
            <Button>Sign in with openid-client</Button>
          </a>
        }
      >
        <p data-testid={`${demo.testIdPrefix}-signed-out`}>
          Not signed in via openid-client.
        </p>
      </ProfilePageShell>
    );
  }

  return (
    <ProfilePageShell
      demo={demo}
      heading={heading}
      description={description}
      actions={
        // A plain form post keeps this page a server component with no
        // client-side JavaScript, and makes the sign-out a POST.
        <form method="post" action={demo.logoutPath}>
          <Button type="submit" variant="outline" data-testid={`${demo.testIdPrefix}-logout-button`}>
            Log out
          </Button>
        </form>
      }
    >
      <p className="font-medium" data-testid={`${demo.testIdPrefix}-signed-in`}>
        Signed in via openid-client!
      </p>
      <ProfileClaims session={session} testIdPrefix={demo.testIdPrefix} />
    </ProfilePageShell>
  );
}
