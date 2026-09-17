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
// and does not clear).

import "server-only";
import { cookies } from "next/headers";
import type { ReactElement } from "react";
import {
  getOpenidClientDemoConfig,
  type OpenidClientDemoConfig,
  type OpenidClientDemoSession,
  type OpenidClientDemoVariant,
} from "./config";

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

export async function renderOpenidClientDemoProfilePage(
  variant: OpenidClientDemoVariant,
): Promise<ReactElement> {
  const demo: OpenidClientDemoConfig = getOpenidClientDemoConfig(variant);
  const heading: string =
    variant === "confidential"
      ? "OpenID Client Profile (confidential client)"
      : "OpenID Client Profile";

  const cookieStore = await cookies();
  const session: OpenidClientDemoSession | null = parseSession(
    cookieStore.get(demo.sessionCookie)?.value,
  );

  if (!session) {
    return (
      <main className="flex flex-col items-center justify-start gap-4 p-4">
        <h1 className="text-xl font-bold">{heading}</h1>
        <p data-testid={`${demo.testIdPrefix}-signed-out`}>
          Not signed in via openid-client.
        </p>
        <a className="underline" href={demo.loginPath}>
          Sign in with openid-client
        </a>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-start gap-4 p-4">
      <h1 className="text-xl font-bold">{heading}</h1>
      <p data-testid={`${demo.testIdPrefix}-signed-in`}>
        Signed in via openid-client!
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">sub</dt>
        <dd data-testid={`${demo.testIdPrefix}-sub`}>{session.sub}</dd>
        <dt className="font-semibold">iss</dt>
        <dd data-testid={`${demo.testIdPrefix}-iss`}>{session.iss}</dd>
        <dt className="font-semibold">aud</dt>
        <dd data-testid={`${demo.testIdPrefix}-aud`}>
          {Array.isArray(session.aud) ? session.aud.join(" ") : session.aud}
        </dd>
        <dt className="font-semibold">email</dt>
        <dd data-testid={`${demo.testIdPrefix}-email`}>
          {session.userinfo.email ?? ""}
        </dd>
        <dt className="font-semibold">email_verified</dt>
        <dd data-testid={`${demo.testIdPrefix}-email-verified`}>
          {typeof session.userinfo.email_verified === "boolean"
            ? String(session.userinfo.email_verified)
            : ""}
        </dd>
        <dt className="font-semibold">name</dt>
        <dd data-testid={`${demo.testIdPrefix}-name`}>
          {session.userinfo.name ?? ""}
        </dd>
        <dt className="font-semibold">preferred_username</dt>
        <dd data-testid={`${demo.testIdPrefix}-preferred-username`}>
          {session.userinfo.preferred_username ?? ""}
        </dd>
      </dl>
      {/* A plain form post keeps this page a server component with no
          client-side JavaScript, and makes the sign-out a POST. */}
      <form method="post" action={demo.logoutPath}>
        <button
          type="submit"
          data-testid={`${demo.testIdPrefix}-logout-button`}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
