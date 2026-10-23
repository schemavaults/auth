"use client";

import { type ReactElement, useState, useTransition } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  cn,
  useToast,
} from "@schemavaults/ui";
import { ThemedPageBackground } from "@/components/ThemedPageBackground";
import { useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAuth, useAppEnvironment } from "@schemavaults/auth-react-provider";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useRouter, useSearchParams } from "next/navigation";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import { successRedirect } from "@/components/AuthForm/success-redirect";
import { closeWindowRedirect } from "@/components/AuthForm/close-window-redirect";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import type { PendingAuthorizationState } from "@/components/AuthForm/handle-auth-form-submit";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import {
  DEFAULT_AUTH_SCOPE,
  OAuth2StateValidationError,
  parseOAuth2State,
  type AppConsentStatus,
} from "@schemavaults/auth-common";
import { formatRedirectDestination } from "@/lib/oauth2/format-redirect-destination";
import { buildVerifyEmailRequiredHref } from "@/lib/email-verification/verify-email-required-href";

export interface AppAuthorizationConsentScreenProps {
  app_id: string;
  // `app_name` / `app_description` are whatever the app's registrant
  // typed in (attacker-controlled under dynamic client registration).
  // They are rendered as inert text and labelled as unverified; the
  // trustworthy signal on the screen is `redirect_uri`'s host.
  app_name: string;
  app_description: string;
  // The OAuth2 `redirect_uri` the user will be sent to after
  // authorizing. Already validated against the app's registered
  // callback allowlist by the page-render guard, so its host tells the
  // user which site is really asking. Null only if the flow somehow
  // carries none (the screen then says the destination is unknown).
  redirect_uri: string | null;
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  mode: "authorize-and-redirect" | "authorize-only";
  /**
   * `authorize-only` mode: called once the consent is recorded. When the
   * user approved API scopes the code minted before the consent screen did
   * not hold, a fresh authorization code for the same flow is passed: hand
   * that one to the app instead.
   */
  onAuthorizationComplete?: (fresh_authorization_code: string | null) => void;
  pendingAuthState?: PendingAuthorizationState;
  /**
   * What the request asks for (`GET /api/apps/{app_id}/check-authorization`
   * with the flow's `scope` / `resource`). Without it the screen shows the
   * generic sign-in permissions only.
   */
  consent?: AppConsentStatus | null;
  debug?: boolean;
}

/** What each OpenID Connect scope lets the app do, in the user's words. */
const OIDC_SCOPE_PERMISSIONS: Readonly<Record<string, string>> = {
  openid: "Sign you in and confirm who you are",
  email: "See your email address",
  profile: "See your name and profile details",
};

export function AppAuthorizationConsentScreen({
  app_id,
  app_name,
  app_description,
  redirect_uri,
  onSuccessfulAuthenticate,
  mode,
  onAuthorizationComplete,
  pendingAuthState: _pendingAuthState,
  consent,
  debug,
}: AppAuthorizationConsentScreenProps): ReactElement {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appEnv = useAppEnvironment();
  const friendly_name: string = useAuthServerFriendlyName();
  const [submitting, startSubmitting] = useTransition();
  const redirect_destination: string | null =
    formatRedirectDestination(redirect_uri);
  // The screen is server-rendered on the already-signed-in authorize path
  // (`/auth/login?app_id=…`), so it can be on screen before the SDK has
  // hydrated and initialised from the session cookie. Authorizing needs
  // the client, so the button stays disabled until then instead of
  // answering an early click with a "not ready" toast.
  const authClientReady: boolean = auth.ready && auth.client.current !== null;

  const pending_api_scopes = consent?.pending_api_scopes ?? [];
  const granted_api_scopes = consent?.granted_api_scopes ?? [];
  // Every pending API scope starts approved; the user may untick any.
  const [approved, setApproved] = useState<ReadonlySet<string>>(
    () => new Set(pending_api_scopes.map((s) => s.scope)),
  );

  // Grant context. `nonce` is OPTIONAL (OIDC Core §3.1.2.1): use the
  // URL value when the RP supplied one, else bind none (null → no
  // id_token claim). `scope` is OPTIONAL too: a third-party flow
  // without one is a plain OAuth 2.1 grant (null → no scope bound,
  // no id_token) and must not be upgraded to the platform default;
  // only the account-page flow falls back to it. `resource` names the
  // API server whose scopes `scope` asks for. Mirrors
  // handle-auth-form-submit.ts.
  const url_scope = searchParams.get("scope");
  const flow_scope: string | null =
    url_scope && url_scope.length > 0
      ? url_scope
      : onSuccessfulAuthenticate === "account-page"
        ? DEFAULT_AUTH_SCOPE
        : null;
  const url_resource = searchParams.get("resource");
  const flow_resource: string | null =
    url_resource && url_resource.length > 0 ? url_resource : null;

  function handleDeny(): void {
    router.push("/account");
    return;
  }

  /**
   * Mints an authorization code for this flow from the signed-in session
   * (bound to the flow's PKCE challenge, `redirect_uri`, nonce, scope and
   * resource, and to the consent just recorded). Null when the flow was
   * parked (expired challenge, e-mail verification): the page navigated
   * away already.
   */
  async function mintFlowAuthorizationCode(
    authClient: ISchemaVaultsAuthClient,
  ): Promise<{ authorization_code: string; challenge_time: number; code_challenge: string } | null> {
    const code_challenge = searchParams.get("code_challenge");
    const challenge_time_str = searchParams.get("challenge_time");
    const flow_redirect_uri = searchParams.get("redirect_uri");
    const url_nonce = searchParams.get("nonce");
    const flow_nonce: string | null =
      url_nonce && url_nonce.length > 0 ? url_nonce : null;

    if (!code_challenge) {
      throw new Error("Missing code_challenge parameter");
    }
    if (!challenge_time_str) {
      throw new Error("Missing challenge_time parameter");
    }
    const challenge_time = parseInt(challenge_time_str);
    if (isNaN(challenge_time)) {
      throw new Error("Invalid challenge_time parameter");
    }
    if (isPkceChallengeExpired(challenge_time)) {
      window.location.href = "/error?error=400&error_id=pkce_challenge_expired";
      return null;
    }

    // The `redirect_uri` must be sent so the server can bind the code to
    // it (the endpoint refuses third-party mints without one).
    const response = await fetch(
      new URL("/api/auth/session/generate-authorization-code", authClient.auth_server_url),
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_app_id: app_id,
          code_challenge,
          code_challenge_method: "S256",
          challenge_time,
          ...(flow_redirect_uri ? { redirect_uri: flow_redirect_uri } : {}),
          ...(flow_nonce ? { nonce: flow_nonce } : {}),
          ...(flow_scope ? { scope: flow_scope } : {}),
          ...(flow_resource ? { resource: flow_resource } : {}),
        }),
      },
    );

    if (!response.ok) {
      // The session mint applies the same e-mail verification gate a
      // fresh login does: park the user on the interstitial (with the
      // flow's parameters) instead of failing the consent screen.
      let refusal: { error_id?: unknown } | null = null;
      try {
        refusal = await response.json();
      } catch {
        refusal = null;
      }
      if (refusal?.error_id === "email_verification_required") {
        toast({
          title: "Almost there",
          description: "Please verify your email address to continue.",
        });
        const flowParams = new URLSearchParams(searchParams.toString());
        flowParams.set("app_id", app_id);
        window.location.assign(buildVerifyEmailRequiredHref(flowParams));
        return null;
      }
      throw new Error("Failed to generate authorization code");
    }

    const data = await response.json();
    if (!data.success || !data.authorization_code) {
      throw new Error("Invalid response from authorization code endpoint");
    }
    return { authorization_code: data.authorization_code as string, challenge_time, code_challenge };
  }

  async function handleAuthorize(): Promise<void> {
    if (!auth.ready || !auth.client.current) {
      toast({
        variant: "destructive",
        title: "Auth client not ready",
        description: "Please try again later.",
      });
      return;
    }

    const authClient = auth.client.current;

    // Step 1: Authorize the app, with the API scopes the user approved.
    // Pass the URL `state` through for API hygiene — the server does not
    // persist it, but accepting it here formalizes the contract and lets
    // us log it in development. A malformed value fails the flow with a
    // destructive toast rather than being round-tripped to the server.
    let urlState: string | null;
    try {
      urlState = parseOAuth2State(searchParams.get("state"));
    } catch (e: unknown) {
      if (e instanceof OAuth2StateValidationError) {
        toast({
          variant: "destructive",
          title: "Invalid OAuth2 state",
          description:
            "The OAuth2 'state' parameter was malformed. Please restart the flow from the requesting app.",
        });
        return;
      }
      throw e;
    }
    const approved_api_scopes: string[] = pending_api_scopes
      .map((s) => s.scope)
      .filter((scope) => approved.has(scope));
    try {
      await authClient.sendAuthorizeClientApplicationRequest(app_id, urlState, {
        scope: flow_scope,
        resource: flow_resource,
        approved_api_scopes,
      });
    } catch (e: unknown) {
      console.error("[AppAuthorizationConsentScreen] Failed to authorize app:", e);
      toast({
        variant: "destructive",
        title: "Authorization failed",
        description: "Failed to authorize the application. Please try again.",
      });
      return;
    }

    toast({
      title: "Application authorized",
      description: `You have authorized ${app_name} to access your account.`,
    });

    if (mode === "authorize-only") {
      // A code minted before this screen holds only the API scopes the
      // user had consented to back then: mint a fresh one when they just
      // approved more.
      if (approved_api_scopes.length > 0) {
        try {
          const minted = await mintFlowAuthorizationCode(authClient);
          if (!minted) return;
          onAuthorizationComplete?.(minted.authorization_code);
        } catch (e: unknown) {
          console.error("[AppAuthorizationConsentScreen] Failed to mint a fresh code:", e);
          toast({
            variant: "destructive",
            title: "Redirect failed",
            description:
              "App was authorized but we couldn't redirect you. Please try again.",
          });
        }
        return;
      }
      onAuthorizationComplete?.(null);
      return;
    }

    // mode === "authorize-and-redirect": generate auth code and redirect
    try {
      const minted = await mintFlowAuthorizationCode(authClient);
      if (!minted) return;
      const { authorization_code, challenge_time, code_challenge } = minted;
      const flow_redirect_uri = searchParams.get("redirect_uri");
      // Already validated in Step 1 above, but re-parse so a second
      // read survives code-refactor reordering. Throws on malformed;
      // the outer try/catch surfaces a destructive toast.
      const state = parseOAuth2State(searchParams.get("state"));

      if (debug) {
        console.log(
          "[AppAuthorizationConsentScreen] Got authorization code, redirecting...",
        );
      }

      const codeChallengeDetails = {
        code_challenge,
        challenge_time,
        code_challenge_method: "S256" as const,
      };

      if (onSuccessfulAuthenticate === "redirect-with-authorization-code") {
        if (!flow_redirect_uri) {
          throw new Error("No redirect URI provided");
        }
        successRedirect({
          redirect_uri: flow_redirect_uri,
          authorization_code,
          code_challenge: codeChallengeDetails,
          app_environment: appEnv,
          state,
          issuer: authClient.auth_server_url,
        });
      } else if (
        onSuccessfulAuthenticate ===
        "send-authorization-code-to-native-app-then-close"
      ) {
        if (!flow_redirect_uri) {
          throw new Error("No redirect URI provided");
        }

        const postResponse = await fetch(flow_redirect_uri, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code_challenge_method: "S256",
            challenge_time: challenge_time.toString(),
            authorization_code,
            ...(typeof state === "string" && state.length > 0
              ? { state }
              : {}),
          }),
        });

        if (postResponse.status !== 200) {
          throw new Error("Failed to send authorization code to native app");
        }

        closeWindowRedirect(authClient);
      }
    } catch (e: unknown) {
      console.error(
        "[AppAuthorizationConsentScreen] Failed to redirect:",
        e,
      );
      toast({
        variant: "destructive",
        title: "Redirect failed",
        description:
          "App was authorized but we couldn't redirect you. Please try again.",
      });
    }
  }

  // What the request asks for, in the user's words. Without the consent
  // details (an unknown request) the generic sign-in permissions are shown.
  const oidc_permissions: string[] = consent
    ? consent.requested_oidc_scopes.flatMap((scope) =>
        OIDC_SCOPE_PERMISSIONS[scope] ? [OIDC_SCOPE_PERMISSIONS[scope]] : [],
      )
    : ["Verify your identity", "Access your account information"];
  const asks_additional_access: boolean =
    consent?.authorized === true && pending_api_scopes.length > 0;
  const api_server_name: string | null = consent?.api_server?.api_server_name ?? null;

  const content = (
    <Card
      className={cn(
        "w-11/12 xs:w-10/12 sm:w-3/4 md:w-2/3 lg:w-1/2 xl:w-1/3",
        "bg-white",
        "md:shadow-md",
        "md:rounded-lg",
        "p-4",
        "my-16",
      )}
    >
      <CardHeader>
        <CardTitle>
          {asks_additional_access ? "Additional Access Requested" : "Authorize Application"}
        </CardTitle>
        <CardDescription className="break-words">
          <strong data-testid="consent-app-name">{app_name}</strong>{" "}
          {asks_additional_access
            ? "is asking for more access to"
            : "wants to access"}{" "}
          your {friendly_name} account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {app_description.length > 0 ? (
          <p
            className="text-sm text-muted-foreground break-words"
            data-testid="consent-app-description"
          >
            {app_description}
          </p>
        ) : null}
        <div className="rounded-md border p-3 bg-muted/50">
          <p className="text-sm font-medium">
            After authorizing, you will be sent to:
          </p>
          {redirect_destination ? (
            <p
              className="text-sm font-mono break-all mt-1"
              data-testid="consent-redirect-host"
            >
              {redirect_destination}
            </p>
          ) : (
            <p
              className="text-sm text-destructive mt-1"
              data-testid="consent-redirect-host"
            >
              Unknown destination
            </p>
          )}
        </div>
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
                      disabled={submitting}
                      onCheckedChange={(checked) => {
                        setApproved((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(scope.scope);
                          else next.delete(scope.scope);
                          return next;
                        });
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
        <p className="text-xs text-muted-foreground">
          The application name and description
          {api_server_name ? ", and the descriptions of the permissions," : ""} are
          provided by the developers and are not verified by{" "}
          {friendly_name}. Only continue if you recognize the destination
          above.
        </p>
      </CardContent>
      <CardFooter className="flex flex-row justify-between items-center gap-4">
        <Button
          variant="outline"
          onClick={handleDeny}
          disabled={submitting}
        >
          <X className="h-4 w-4 mr-2" />
          Deny
        </Button>
        <Button
          className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
          onClick={() => {
            startSubmitting(async () => {
              await handleAuthorize();
            });
          }}
          disabled={submitting || !authClientReady}
          data-testid="consent-authorize-button"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
          ) : (
            <ShieldCheck className="h-4 w-4 mr-2" />
          )}
          Authorize & Continue
        </Button>
      </CardFooter>
    </Card>
  );

  if (mode === "authorize-and-redirect") {
    return (
      <ThemedPageBackground
        className="items-center justify-center flex"
        backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
      >
        {content}
      </ThemedPageBackground>
    );
  }

  return content;
}

export default AppAuthorizationConsentScreen;
