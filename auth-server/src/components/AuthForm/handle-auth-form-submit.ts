import type {
  ISchemaVaultsAuthClient,
  SchemaVaultsAppEnvironment,
  useAuth,
} from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import type { AuthFormData } from "./auth-form-data";
import {
  type CodeChallengeWithDetails,
  type CodeVerifierWithDetails,
  PKCE_ProofKeyManager,
  parseOAuth2State,
} from "@schemavaults/auth-common";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import {
  type OnSuccessfulAuthenticateAction,
  onSuccessfulAuthenticateActionSchema,
} from "@/lib/authentication_outcome_type";
import type { useRouter } from "next/navigation";
import { performPostAuthRedirect } from "./perform-post-auth-redirect";
import type { PartialAppInfo } from "@/lib/PartialAppInfo";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

export interface PendingAuthorizationState {
  authorization_code: string;
  code_challenge: CodeChallengeWithDetails;
  code_verifier: CodeVerifierWithDetails;
  redirect_uri: string | null | undefined;
  // OAuth2 `state` observed on the authorize URL. Threaded through the
  // consent-screen interstitial so the callback redirect can echo it
  // untouched (RFC 6749 §10.12).
  state: string | null;
}

interface HandleAuthFormSubmitOptions<T extends "login" | "register"> {
  values: AuthFormData<T>;
  toast: ReturnType<typeof useToast>["toast"];
  type: T;
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  onSubmitFailure: (e: unknown) => void;
  auth: ReturnType<typeof useAuth>;
  searchParams: URLSearchParams;
  router: ReturnType<typeof useRouter>;
  env: SchemaVaultsAppEnvironment;
  debug?: boolean;
  app?: PartialAppInfo | null;
  onAppAuthorizationNeeded?: (state: PendingAuthorizationState) => void;
}

export async function handleAuthFormSubmit<T extends "login" | "register">(
  opts: HandleAuthFormSubmitOptions<T>,
) {
  const {
    values,
    type,
    toast,
    onSuccessfulAuthenticate,
    auth,
    searchParams,
    router,
    onSubmitFailure,
  } = opts;
  const env = opts.env;
  const debug: boolean = opts.debug ?? false;

  if (debug) {
    console.log(`[AuthForm] handleFormSubmit: type=${type}`);
  }

  if (
    !onSuccessfulAuthenticateActionSchema.safeParse(onSuccessfulAuthenticate)
      .success
  ) {
    throw new Error(
      `Invalid onSuccessfulAuthenticate action, received "${onSuccessfulAuthenticate}"`,
    );
  }

  let authClient: ISchemaVaultsAuthClient | null = null;
  if (auth.ready) {
    authClient = auth.client.current;
  }

  if (!authClient) {
    if (env !== "production") {
      console.error("[AuthForm] Auth client is not ready, throw an error...");
    }
    toast({
      variant: "destructive",
      title: "Auth client not ready",
      description:
        "Failed to creates tokens from successful authentication; please try again later.",
    });
    onSubmitFailure(new Error("Auth client not ready"));
    return;
  }

  let code_verifier: CodeVerifierWithDetails;
  try {
    code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
  } catch (e: unknown) {
    console.error("Failed to create code verifier: ", e);
    let errorMessage: string =
      "An unknown error occurred while trying to create a code verifier!";
    if (e instanceof Error) {
      errorMessage = e.message;
    }
    toast({
      variant: "destructive",
      title: "Error creating code verifier",
      description: errorMessage,
    });
    onSubmitFailure(e);
    return;
  }

  // Get the code challenge (store the code verifier somewhere locally / use the one passed by requseting app)
  let code_challenge: CodeChallengeWithDetails;
  try {
    if (onSuccessfulAuthenticate === "account-page") {
      const pkce = new PKCE_ProofKeyManager(code_verifier);
      const new_code_challenge = await pkce.getCodeChallenge();
      if (!new_code_challenge) {
        throw new Error(
          "Failed to create code challenge using PKCE Proof Key Manager",
        );
      } else if (typeof new_code_challenge !== "object") {
        throw new Error("Invalid code challenge");
      } else if (
        !new_code_challenge.code_challenge ||
        typeof new_code_challenge.code_challenge !== "string"
      ) {
        throw new Error("Invalid code challenge");
      } else if (
        !new_code_challenge.challenge_time ||
        typeof new_code_challenge.challenge_time !== "number"
      ) {
        throw new Error("Invalid challenge time");
      } else if (new_code_challenge.code_challenge_method !== "S256") {
        throw new Error("Invalid code challenge method");
      }
      code_challenge = new_code_challenge;
    } else if (
      // Was this page opened with a code_verifier and the result is being forwarded?
      onSuccessfulAuthenticate === "redirect-with-authorization-code" ||
      onSuccessfulAuthenticate ===
        "send-authorization-code-to-native-app-then-close"
    ) {
      const challenge: string | null = searchParams.get("code_challenge");
      if (!challenge) {
        throw new Error("No code challenge provided for redirect flow");
      }
      const challenge_time_str: string | null =
        searchParams.get("challenge_time");
      if (!challenge_time_str) {
        throw new Error("No challenge time provided for redirect flow");
      }
      const challenge_time: number = parseInt(challenge_time_str);
      if (isNaN(challenge_time)) {
        throw new Error("Invalid challenge time provided for redirect flow");
      }
      if (isPkceChallengeExpired(challenge_time)) {
        window.location.href = "/error?error=400&error_id=pkce_challenge_expired";
        return;
      }
      if (searchParams.get("code_challenge_method") !== "S256") {
        throw new Error(
          "Invalid code challenge method provided for redirect flow",
        );
      }
      code_challenge = {
        code_challenge: challenge,
        challenge_time,
        code_challenge_method: "S256",
      } satisfies CodeChallengeWithDetails;
    } else {
      throw new Error(
        `Invalid onSuccessfulAuthenticate action, received "${onSuccessfulAuthenticate}"`,
      );
    }
  } catch (e: unknown) {
    console.error("Error creating code challenge: ", e);
    toast({
      variant: "destructive",
      title: "Error creating code challenge",
      description: "An error occurred while trying to create a code challenge",
    });
    onSubmitFailure(e);
    return;
  }

  // The authorization code must be bound to the app it will be redeemed
  // for. In the third-party PKCE flow that's the resource server
  // (from the URL `?app_id=...` → `opts.app.app_id`); in the
  // account-page flow the caller is the auth server itself.
  const target_client_app_id =
    opts.app?.app_id ?? SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;

  // Exchange credentials for an authorization code (or an MFA challenge).
  // The SDK now returns the discriminated AuthenticateResult union; the
  // MFA-required branch is wired up in a later commit. For now, treat any
  // non-authenticated outcome as an error so existing flows compile.
  let authorization_code: string;
  try {
    const result = await authClient.sendAuthenticateRequest(
      type,
      target_client_app_id,
      values,
      code_challenge,
    );
    if (result.kind !== "authenticated") {
      throw new Error(
        `Unexpected authenticate result kind: ${result.kind}`,
      );
    }
    authorization_code = result.authorization_code;
  } catch (e: unknown) {
    console.error("[handleAuthFormSubmit] Error", e);
    const errMsg: string =
      e instanceof Error
        ? e.message
        : "An unknown error occurred while trying to authenticate";
    toast({
      variant: "destructive",
      title: type === "login" ? "Sign-in Error" : "Registration Error",
      description: errMsg,
    });
    onSubmitFailure(e);
    return;
  }

  // Check if the app requires authorization before redirect
  if (
    opts.app &&
    opts.app.app_id !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id &&
    onSuccessfulAuthenticate !== "account-page" &&
    opts.onAppAuthorizationNeeded
  ) {
    // Check if the user has already authorized this app
    let alreadyAuthorized = false;
    try {
      alreadyAuthorized = await authClient.checkAppAuthorization(opts.app.app_id);
    } catch {
      // If the check fails, fall through to showing the consent screen (safe default)
    }

    if (!alreadyAuthorized) {
      const redirect_uri: string | null | undefined =
        searchParams.get("redirect_uri");
      const state: string | null = parseOAuth2State(
        searchParams.get("state"),
      );
      opts.onAppAuthorizationNeeded({
        authorization_code,
        code_challenge,
        code_verifier,
        redirect_uri,
        state,
      });
      return;
    }
  }

  const toast_title: string =
    type === "login" ? "Successfully logged in!" : "Successfully registered!";

  const register_description: string =
    "Welcome to SchemaVaults! Please verify your email address to continue.";
  let toast_description: string | undefined = undefined;

  if (type === "login") {
    if (onSuccessfulAuthenticate === "account-page") {
      toast_description = "Sending you to your account dashboard...";
    } else if (
      onSuccessfulAuthenticate === "redirect-with-authorization-code"
    ) {
      toast_description = "Redirecting you back to the requesting app...";
    } else if (
      onSuccessfulAuthenticate ===
      "send-authorization-code-to-native-app-then-close"
    ) {
      toast_description = "Sending authorization code to the requesting app...";
    } else {
      throw new Error(
        "No toast description found for login outcome action type",
      );
    }
  } else if (type === "register") {
    toast_description = register_description;
  }

  if (!toast_description || typeof toast_description !== "string") {
    throw new TypeError("Failed to load toast description");
  }

  toast({
    title: toast_title,
    description: toast_description,
  });

  // Redirect back to the client with the authorization code
  if (debug) {
    console.log(
      `[AuthForm] Redirecting to client with authorization code: `,
      authorization_code,
    );
  }

  const redirect_uri: string | null | undefined =
    searchParams.get("redirect_uri");
  // Throws `OAuth2StateValidationError` on malformed state; the caller
  // (auth-form.tsx onSubmit) catches and shows a destructive toast.
  const state: string | null = parseOAuth2State(searchParams.get("state"));

  await performPostAuthRedirect({
    onSuccessfulAuthenticate,
    authorization_code,
    code_challenge,
    code_verifier,
    redirect_uri,
    state,
    auth,
    router,
    toast,
    env,
    debug,
  });
}
