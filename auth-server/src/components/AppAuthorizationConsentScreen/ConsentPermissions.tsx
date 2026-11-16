"use client";

import type { ReactElement } from "react";
import { Checkbox, Label } from "@schemavaults/ui";
import { Check } from "lucide-react";
import type { AppConsentStatus } from "@schemavaults/auth-common";

/** What each OpenID Connect scope lets the app do, in the user's words. */
export const OIDC_SCOPE_PERMISSIONS: Readonly<Record<string, string>> = {
  openid: "Sign you in and confirm who you are",
  email: "See your email address",
  profile: "See your name and profile details",
};

export interface ConsentPermissionsProps {
  /**
   * What the request asks for (`GET /api/apps/{app_id}/check-authorization`,
   * or the device sign-in lookup). Without it the generic sign-in
   * permissions are shown.
   */
  consent: AppConsentStatus | null | undefined;
  /** The pending API scopes the user left ticked. */
  approved: ReadonlySet<string>;
  onApprovedChange: (approved: ReadonlySet<string>) => void;
  disabled: boolean;
}

/**
 * The "This application will be able to:" box of a consent screen: the
 * requested OIDC scopes in the user's words, then the requested API scopes
 * of the request's API server, pending ones with a checkbox (ticked by
 * default) and already granted ones with a check mark. Shared by the
 * browser sign-in consent screen and the `/device` page.
 */
export function ConsentPermissions({
  consent,
  approved,
  onApprovedChange,
  disabled,
}: ConsentPermissionsProps): ReactElement {
  const pending_api_scopes = consent?.pending_api_scopes ?? [];
  const granted_api_scopes = consent?.granted_api_scopes ?? [];
  const api_server_name: string | null = consent?.api_server?.api_server_name ?? null;
  const oidc_permissions: string[] = consent
    ? consent.requested_oidc_scopes.flatMap((scope) =>
        OIDC_SCOPE_PERMISSIONS[scope] ? [OIDC_SCOPE_PERMISSIONS[scope]] : [],
      )
    : ["Verify your identity", "Access your account information"];

  return (
    <div className="rounded-md border p-3 bg-muted/50">
      <p className="text-sm font-medium">This application will be able to:</p>
      {oidc_permissions.length > 0 ? (
        <ul
          className="list-disc list-inside text-sm text-muted-foreground mt-1"
          data-testid="consent-oidc-permissions"
        >
          {oidc_permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      ) : pending_api_scopes.length === 0 && granted_api_scopes.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-1">
          Act on your behalf with access tokens it requests.
        </p>
      ) : null}
      {api_server_name && (pending_api_scopes.length > 0 || granted_api_scopes.length > 0) ? (
        <div className="mt-3 space-y-2" data-testid="consent-api-scopes">
          <p className="text-sm font-medium break-words">
            Access <span className="font-semibold">{api_server_name}</span> on your behalf:
          </p>
          {pending_api_scopes.map((scope) => {
            const id = `consent-api-scope-${scope.api_server_scope_id}`;
            return (
              <div key={scope.api_server_scope_id} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  checked={approved.has(scope.scope)}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = new Set(approved);
                    if (checked === true) next.add(scope.scope);
                    else next.delete(scope.scope);
                    onApprovedChange(next);
                  }}
                  data-testid="consent-api-scope-checkbox"
                  data-scope={scope.scope}
                />
                <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal">
                  <span className="text-sm break-words">{scope.description}</span>
                  <span className="text-xs font-mono text-muted-foreground break-all">
                    {scope.scope}
                  </span>
                </Label>
              </div>
            );
          })}
          {granted_api_scopes.map((scope) => (
            <div
              key={scope.api_server_scope_id}
              className="flex items-start gap-2"
              data-testid="consent-granted-api-scope"
              data-scope={scope.scope}
            >
              <Check className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground break-words">
                  {scope.description} (already granted)
                </span>
                <span className="text-xs font-mono text-muted-foreground break-all">
                  {scope.scope}
                </span>
              </div>
            </div>
          ))}
          {pending_api_scopes.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Untick anything you do not want to allow. You can withdraw
              access later from your account&apos;s third-party access page.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ConsentPermissions;
