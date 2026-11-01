"use client";

import type { ReactElement } from "react";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { Alert, AlertDescription, AlertTitle } from "@schemavaults/ui";
import { ShieldAlert } from "lucide-react";
import { resolveRedirectUriValidationTier } from "@/lib/oauth2/redirect-uri-validation-tier";

export interface MissingCallbackUrlAlertProps {
  environment: SchemaVaultsAppEnvironment;
  /** Whether the app has a client secret (a confidential client). */
  has_client_secret: boolean;
}

/**
 * Shown by `<AppCallbackUrlsCard />` while an app has no callback URL in
 * the deployment's environment: a public client then cannot sign anyone
 * in there (every `redirect_uri` is refused), and a confidential client
 * accepts any path on its registered domains.
 */
export function MissingCallbackUrlAlert({
  environment,
  has_client_secret,
}: MissingCallbackUrlAlertProps): ReactElement {
  const tier = resolveRedirectUriValidationTier({
    has_callback_urls: false,
    hardcoded: false,
    confidential: has_client_secret,
  });

  if (tier === "refuse") {
    return (
      <Alert variant="destructive" data-testid="missing-callback-url-alert">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Sign-in is blocked in {environment}</AlertTitle>
        <AlertDescription>
          This app is a public client (it has no client secret) and has no
          callback URL in this environment, so every OAuth2/OIDC redirect is
          refused. Add the exact URL your app receives authorization codes
          on.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning" data-testid="missing-callback-url-alert">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>No callback URL in {environment}</AlertTitle>
      <AlertDescription>
        Redirects are accepted on any path of this app&apos;s registered
        domains, so a page there that leaks its URL (an open redirect, user
        content, a third-party script reading the Referer) could expose
        authorization codes. Register the exact callback URL to close this.
      </AlertDescription>
    </Alert>
  );
}

export default MissingCallbackUrlAlert;
