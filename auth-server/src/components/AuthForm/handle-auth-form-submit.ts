import type {
  ISchemaVaultsAuthClient,
  SchemaVaultsAppEnvironment,
  useAuth,
} from "@schemavaults/auth-react-provider";
import { successRedirect } from "./success-redirect";
import { closeWindowRedirect } from "./close-window-redirect";
import { useToast } from "@schemavaults/ui";
import { AuthFormData } from "./auth-form-data";
import {
  CodeChallenge,
  type CodeChallengeWithDetails,
  CodeVerifier,
  type CodeVerifierWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth";
import {
  type OnSuccessfulAuthenticateAction,
  onSuccessfulAuthenticateActionSchema,
} from "@/lib/authentication_outcome_type";
import type { useRouter } from "next/navigation";

interface HandleAuthFormSubmitOptions<T extends "login" | "register"> {
  values: AuthFormData<T>;
  toast: ReturnType<typeof useToast>["toast"];
  type: T;
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  onSubmitFailure: () => void;
  auth: ReturnType<typeof useAuth>;
  searchParams: URLSearchParams;
  router: ReturnType<typeof useRouter>;
  env: SchemaVaultsAppEnvironment;
}

const CLOSE_WINDOW_PAGE_HREF = "/close_window" as const satisfies string;

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

  if (env !== "production") {
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
    onSubmitFailure();
    return;
  }

  let code_verifier: CodeVerifierWithDetails;
  try {
    code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
  } catch (e: unknown) {
    console.error("Failed to create code verifier: ", e);
    toast({
      variant: "destructive",
      title: "Error creating code verifier",
      description: "An error occurred while trying to create a code verifier",
    });
    onSubmitFailure();
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
    console.error(e);
    toast({
      variant: "destructive",
      title: "Error creating code challenge",
      description: "An error occurred while trying to create a code challenge",
    });
    onSubmitFailure();
    return;
  }

  // Exchange credentials for an authorization code
  let authorization_code: string;
  try {
    authorization_code = await authClient.sendAuthenticateRequest(
      type,
      values,
      code_challenge,
    );
  } catch (e: unknown) {
    console.error("[handleAuthFormSubmit] Error", e);
    toast({
      variant: "destructive",
      title: type === "login" ? "Sign-in Error" : "Registration Error",
      description:
        e instanceof Error
          ? e.message
          : "An unknown error occurred while trying to authenticate",
    });
    onSubmitFailure();
    return;
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

  if (!toast_description) throw new Error("Failed to load toast description");

  toast({
    title: toast_title,
    description: toast_description,
  });

  // Redirect back to the client with the authorization code
  if (env !== "production") {
    console.log(
      `[AuthForm] Redirecting to client with authorization code: `,
      authorization_code,
    );
  }

  const redirect_uri: string | null | undefined =
    searchParams.get("redirect_uri");

  switch (onSuccessfulAuthenticate) {
    case "account-page":
      if (env !== "production") {
        console.log("[AuthForm] Redirecting to account page");
      }

      await authClient.handleSuccessfulAuthentication(
        authorization_code,
        code_challenge.challenge_time,
        code_verifier.code_verifier,
      );

      router.push("/account");
      break;
    case "redirect-with-authorization-code":
      if (env !== "production") {
        console.log(
          "[AuthForm] Redirecting back to client with authorization code...",
        );
      }
      // Go to redirect_uri with the authorization code and the challenge_time

      if (!redirect_uri) {
        throw new Error("No redirect URI provided for redirect flow");
      }
      try {
        successRedirect({
          redirect_uri,
          authorization_code,
          code_challenge,
          app_environment: env,
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
        console.log("[AuthForm] Sending authorization code to client...");
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
          }),
        });

        // Prefetch close window page
        try {
          if (env !== "production") {
            console.log(
              `[handleAuthFormSubmit] Prefetching close window page: ${CLOSE_WINDOW_PAGE_HREF}`,
            );
          }
          router.prefetch(CLOSE_WINDOW_PAGE_HREF);
        } catch (e: unknown) {
          /** no-op */
        }

        const post_code_to_client_response =
          await post_code_to_client_response_promise;
        if (post_code_to_client_response.status !== 200) {
          throw new Error("Non-200 status code on response");
        }

        if (env !== "production") {
          console.log(
            `[handleAuthFormSubmit] Sending to close window page: ${CLOSE_WINDOW_PAGE_HREF}`,
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
      if (env !== "production") {
        console.error(
          `Invalid onSuccessfulAuthenticate action: "${onSuccessfulAuthenticate}"`,
        );
      }
      throw new Error("Invalid onSuccessfulAuthenticate action");
  }
}
