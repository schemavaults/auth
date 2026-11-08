import type { ReactElement } from "react";
import type { OpenidClientDemoSession } from "./config";

/**
 * The claims an openid-client demo sign-in established, each with a stable
 * `data-testid` (`<prefix>-sub`, `<prefix>-email`, ...) for the E2E suite.
 */
export function ProfileClaims({
  session,
  testIdPrefix,
}: {
  session: OpenidClientDemoSession;
  testIdPrefix: string;
}): ReactElement {
  const rows: readonly { claim: string; testId: string; value: string }[] = [
    { claim: "sub", testId: "sub", value: session.sub },
    { claim: "iss", testId: "iss", value: session.iss },
    { claim: "aud", testId: "aud", value: Array.isArray(session.aud) ? session.aud.join(" ") : session.aud },
    { claim: "email", testId: "email", value: session.userinfo.email ?? "" },
    {
      claim: "email_verified",
      testId: "email-verified",
      value: typeof session.userinfo.email_verified === "boolean" ? String(session.userinfo.email_verified) : "",
    },
    { claim: "name", testId: "name", value: session.userinfo.name ?? "" },
    { claim: "preferred_username", testId: "preferred-username", value: session.userinfo.preferred_username ?? "" },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map((row) => (
        <div key={row.claim} className="contents">
          <dt className="font-mono font-semibold">{row.claim}</dt>
          <dd className="mb-2 font-mono text-muted-foreground [overflow-wrap:anywhere] sm:mb-0" data-testid={`${testIdPrefix}-${row.testId}`}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default ProfileClaims;
