import type { ReactElement } from "react";
import { Callout } from "@schemavaults/ui";

export interface ClientAppsCalloutProps {
  /** `SCHEMAVAULTS_CLIENT_APP_ID`: the public client. */
  publicClientId: string;
  /** `OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID`, or null when unset. */
  confidentialClientId: string | null;
}

/**
 * Why the public and confidential demos sign in as two different apps. The
 * auth server requires an app's client secret on every token request once
 * the app has one (401 `invalid_client` without it), and the public-client
 * sign-ins have no secret to send. Warns when this deployment points both
 * at the same app.
 */
export function ClientAppsCallout({ publicClientId, confidentialClientId }: ClientAppsCalloutProps): ReactElement {
  const sameApp: boolean = confidentialClientId === publicClientId;
  return (
    <Callout
      intent={sameApp ? "caution" : "important"}
      title="Public and confidential clients need separate apps"
      data-testid="client-apps-callout"
      data-same-app={sameApp}
    >
      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        <p>
          The demos below sign in as two different client apps registered on the auth server, and one app
          can&apos;t be both. Once a client secret is set on an app, the auth server requires that secret on
          every token request for the app. The public-client sign-ins have no secret to send, so{" "}
          <strong>they stop working for an app that has one</strong>.
        </p>
        <p>
          Register two apps: keep the public client&apos;s app without a secret, and give the secret to the
          confidential client&apos;s app only.
        </p>
        {sameApp ? (
          <p className="font-medium" data-testid="client-apps-callout-same-app">
            This deployment uses the same app (<code className="font-mono [overflow-wrap:anywhere]">{publicClientId}</code>)
            for both, so the sign-ins of one kind or the other will fail.
          </p>
        ) : null}
      </div>
    </Callout>
  );
}

export default ClientAppsCallout;
