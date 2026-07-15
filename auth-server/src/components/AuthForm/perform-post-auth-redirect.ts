import type {
  ISchemaVaultsAuthClient,
  SchemaVaultsAppEnvironment,
  useAuth,
} from "@schemavaults/auth-react-provider";
import { successRedirect } from "./success-redirect";
import { closeWindowRedirect } from "./close-window-redirect";
import { useToast } from "@schemavaults/ui";
import type {
  CodeChallengeWithDetails,
  CodeVerifierWithDetails,
} from "@schemavaults/auth-common";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import type { useRouter } from "next/navigation";

const CLOSE_WINDOW_PAGE_HREF = "/close_window" as const satisfies string;

export interface PerformPostAuthRedirectOptions {
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  authorization_code: string;
  code_challenge: CodeChallengeWithDetails;
  code_verifier: CodeVerifierWithDetails;
  redirect_uri: string | null | undefined;
  // OAuth2 `state` received from the client — echoed untouched on the
  // callback redirect for CSRF defence.
  state: string | null | undefined;
  // Login replay nonce bound to the minted authorization code. Used by
  // the account-page flow to verify the token-response echo; third-party
  // flows verify in their own SDK context. Null when the flow carried no
  // nonce (an OIDC RP may omit it) — nothing is echoed/verified then.
  nonce: string | null;
  auth: ReturnType<typeof useAuth>;
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>["toast"];
  env: SchemaVaultsAppEnvironment;
  debug: boolean;
}

export async function performPostAuthRedirect(
  opts: PerformPostAuthRedirectOptions,
): Promise<void> {
  const {
    onSuccessfulAuthenticate,
    authorization_code,
    code_challenge,
    code_verifier,
    redirect_uri,
    state,
    nonce,
    auth,
    router,
    toast,
    env,
    debug,
  } = opts;

  let authClient: ISchemaVaultsAuthClient | null = null;
  if (auth.ready) {
    authClient = auth.client.current;
  }

  switch (onSuccessfulAuthenticate) {
    case "account-page":
      if (env !== "production") {
        console.log("[AuthForm] Redirecting to account page");
      }

      if (!authClient) {
        throw new Error("Auth client not ready for account-page redirect");
      }

      await authClient.handleSuccessfulAuthentication(
        authorization_code,
        code_challenge.challenge_time,
        code_verifier.code_verifier,
        // `received_state` is intentionally undefined: OAuth2 `state`
        // (RFC 6749 §10.12) authenticates a cross-origin redirect
        // callback, and this same-context flow has none — the code never
        // leaves the JS context that requested it. Passing the
        // code_verifier directly puts the SDK in same-context mode,
        // where it skips the state check (and no state was ever stored
        // for this flow to compare against). `opts.state` serves the
        // redirect / native-app branches below, which echo it to the
        // third-party client for verification in ITS SDK context.
        undefined,
        nonce,
      );

      router.push("/account");
      break;
    case "redirect-with-authorization-code":
      if (env !== "production") {
        console.log(
          "[AuthForm] Redirecting back to client with authorization code...",
        );
      }

      if (!redirect_uri) {
        throw new Error("No redirect URI provided for redirect flow");
      }
      try {
        successRedirect({
          redirect_uri,
          authorization_code,
          code_challenge,
          app_environment: env,
          state,
          issuer: authClient?.auth_server_url ?? null,
        });
      } catch (e: unknown) {
        console.error(e);
        toast({
          variant: "destructive",
          title: "Failed to redirect back to client",
          description:
            "An error occurred while trying to redirect back to the requesting app",
        });
      }
      break;
    case "send-authorization-code-to-native-app-then-close":
      if (env !== "production") {
        console.log(
          "[AuthForm] Sending authorization code to native-app client...",
        );
      }

      if (!redirect_uri) {
        throw new Error(
          "No redirect URI provided for authorization code transfer flow",
        );
      }

      try {
        const post_code_to_client_response_promise = fetch(redirect_uri, {
          method: "POST",
          headers: new Headers({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            code_challenge_method: code_challenge.code_challenge_method,
            challenge_time: code_challenge.challenge_time.toString(),
            authorization_code,
            ...(typeof state === "string" && state.length > 0
              ? { state }
              : {}),
          }),
        });

        // Prefetch close window page
        try {
          if (debug) {
            console.log(
              `[performPostAuthRedirect] Prefetching close window page: ${CLOSE_WINDOW_PAGE_HREF}`,
            );
          }
          router.prefetch(CLOSE_WINDOW_PAGE_HREF);
        } catch (e: unknown) {
          console.warn("Failed to prefetch close window page: ", e);
          /** no-op */
        }

        const post_code_to_client_response =
          await post_code_to_client_response_promise;
        if (post_code_to_client_response.status !== 200) {
          throw new Error("Non-200 status code on response");
        }

        if (debug) {
          console.log(
            `[performPostAuthRedirect] Sending to close window page: ${CLOSE_WINDOW_PAGE_HREF}`,
          );
        }

        let auth_client: ISchemaVaultsAuthClient | null = null;
        if (auth.ready) auth_client = auth.client.current;
        if (!auth_client) {
          return;
        } else {
          closeWindowRedirect(auth_client);
          return;
        }
      } catch (e: unknown) {
        console.error(
          "Failed to send authorization code to frontend client",
          e,
        );
        throw new Error("Failed to send authorization code to frontend client");
      }
    default:
      if (debug) {
        console.error(
          `Invalid onSuccessfulAuthenticate action: "${onSuccessfulAuthenticate}"`,
        );
      }
      throw new Error("Invalid onSuccessfulAuthenticate action");
  }
}
