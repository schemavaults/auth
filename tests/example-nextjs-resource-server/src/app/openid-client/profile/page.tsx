// /openid-client/profile
//
// Displays the identity established by the openid-client demo sign-in
// flow (see src/lib/openid-client-demo). Reads the httpOnly session
// cookie written by /openid-client/callback and renders the id_token +
// userinfo claims with stable data-testid hooks for the E2E suite.

import "server-only";
import { cookies } from "next/headers";
import type { ReactElement } from "react";
import {
  LOGIN_PATH,
  SESSION_COOKIE,
  type OpenidClientDemoSession,
} from "@/lib/openid-client-demo";

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

export default async function OpenidClientProfilePage(): Promise<ReactElement> {
  const cookieStore = await cookies();
  const session: OpenidClientDemoSession | null = parseSession(
    cookieStore.get(SESSION_COOKIE)?.value,
  );

  if (!session) {
    return (
      <main className="flex flex-col items-center justify-start gap-4 p-4">
        <h1 className="text-xl font-bold">OpenID Client Profile</h1>
        <p data-testid="openid-client-signed-out">
          Not signed in via openid-client.
        </p>
        <a className="underline" href={LOGIN_PATH}>
          Sign in with openid-client
        </a>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-start gap-4 p-4">
      <h1 className="text-xl font-bold">OpenID Client Profile</h1>
      <p data-testid="openid-client-signed-in">Signed in via openid-client!</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">sub</dt>
        <dd data-testid="openid-client-sub">{session.sub}</dd>
        <dt className="font-semibold">iss</dt>
        <dd data-testid="openid-client-iss">{session.iss}</dd>
        <dt className="font-semibold">aud</dt>
        <dd data-testid="openid-client-aud">
          {Array.isArray(session.aud) ? session.aud.join(" ") : session.aud}
        </dd>
        <dt className="font-semibold">email</dt>
        <dd data-testid="openid-client-email">
          {session.userinfo.email ?? ""}
        </dd>
        <dt className="font-semibold">email_verified</dt>
        <dd data-testid="openid-client-email-verified">
          {typeof session.userinfo.email_verified === "boolean"
            ? String(session.userinfo.email_verified)
            : ""}
        </dd>
      </dl>
    </main>
  );
}

export const dynamic = "force-dynamic";
