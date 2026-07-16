import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
  authenticateResultSchema,
  type AuthenticateResult,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { credentialsSchema } from "@/lib/credentials-schema";
import {
  isValidAuthenticationOutcomeType,
  type AuthenticationOutcomeType,
} from "./authentication-outcome-type";
import type { ISendAuthenticateRequestOptions } from "@/types/ISendAuthenticateRequestOptions";
import type { Credentials } from "@/types/credentials";

// Send an authentication request to the auth server. Returns the parsed
// AuthenticateResult discriminated union so callers can branch between
// `authenticated` (authorization code present), `mfa_required` (challenge
// must be completed at /api/auth/mfa/verify), and `failure` outcomes.
export async function sendAuthenticateRequest(
  opts: ISendAuthenticateRequestOptions,
): Promise<AuthenticateResult> {
  const credentials: Credentials = opts.credentials;
  const client_app_id = opts.client_app_id;
  const code_challenge: CodeChallengeWithDetails = opts.code_challenge;
  const authentication_type: AuthenticationOutcomeType =
    opts.authentication_type;
  const adapter: ISchemaVaultsAuthClientAdapter = opts.adapter;
  const env = opts.app_environment;
  const redirect_uri: string | null = opts.redirect_uri;
  const auth_server_url: string = opts.auth_server_url;

  if (env === "development") {
    console.log(
      "[sendAuthenticateRequest] sending request to the auth server...",
    );
  }

  if (!isValidAuthenticationOutcomeType(authentication_type)) {
    throw new Error("Invalid authentication outcome type");
  }

  const parsed_credentials = credentialsSchema.safeParse(credentials);
  if (!parsed_credentials.success) {
    console.error(parsed_credentials.error);
    throw new Error("Invalid credentials");
  }

  const parsed_code_challenge =
    PKCE_ProofKeyManager.codeChallengeSchema.safeParse(
      code_challenge.code_challenge,
    );
  if (!parsed_code_challenge.success) {
    console.error(parsed_code_challenge.error);
    throw new Error("Invalid code challenge");
  }

  if (code_challenge.code_challenge_method !== "S256") {
    throw new Error("Invalid code challenge method");
  }

  if (authentication_type === "reset-password") {
    throw new Error("Not implemented");
  }

  if (!credentials.email) {
    throw new Error("Email is required");
  }

  if (authentication_type === "login" && !credentials.password) {
    throw new Error("Password is required");
  }

  if (authentication_type === "register") {
    if (!credentials.password) {
      throw new Error("Password is required");
    }
    if (!credentials.confirm) {
      throw new Error("Password confirmation is required");
    }
    if (credentials.password !== credentials.confirm) {
      throw new Error("Passwords do not match");
    }

    if (opts.invite_code_required && !credentials.invite_code) {
      throw new Error("Invite code is required while in private beta");
    }
  }

  // `nonce` is optional (OIDC Core §3.1.2.1); a non-string / empty value
  // is treated as absent and omitted from the body rather than rejected.
  const nonce: string | null =
    typeof opts.nonce === "string" && opts.nonce.length > 0
      ? opts.nonce
      : null;
  if (typeof opts.scope !== "string" || opts.scope.length === 0) {
    throw new TypeError(
      "A non-empty 'scope' is required on every authenticate request",
    );
  }

  const auth_request_body = {
    credentials: {
      email: credentials.email,
      password: credentials.password,
    },
    invite_code: credentials.invite_code,
    client_app_id,
    code_challenge: code_challenge.code_challenge,
    challenge_time: code_challenge.challenge_time,
    redirect_uri,
    // Omit entirely when absent so the server's optional schema sees no key.
    ...(nonce ? { nonce } : {}),
    scope: opts.scope,
  };

  let response: Response;
  try {
    if (env === "development") {
      console.log("[sendAuthenticateRequest] Sending POST request via adapter");
    }
    const authentication_request_response: Response = await adapter.fetch(
      new URL(`/api/auth/${authentication_type}`, auth_server_url).toString(),
      {
        body: JSON.stringify(auth_request_body),
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    if (!authentication_request_response) {
      throw new Error(
        "No response received from client auth adapter HTTP client",
      );
    }
    response = authentication_request_response;
  } catch (e: unknown) {
    console.error("Failed to send HTTP authentication request: ", e);
    throw new Error("Failed to send HTTP authentication request");
  }

  if (typeof response.status === "number" && response.status >= 500) {
    let errorMsg: string =
      "Unknown server-side error handling authentication request :(";
    try {
      const error_response_body: unknown = await response.json();
      if (
        typeof error_response_body === "object" &&
        error_response_body !== null
      ) {
        if (
          "message" in error_response_body &&
          typeof error_response_body.message === "string"
        ) {
          errorMsg = error_response_body.message;
        }
      }
    } catch (error: unknown) {
      void error;
    }
    throw new Error(errorMsg);
  }

  if (typeof response.status === "number" && response.status === 404) {
    throw new Error(
      "User does not exist! Ensure that you have the correct credentials!",
    );
  }

  if (typeof response.status === "number" && response.status === 409) {
    throw new Error("User already exists! Try logging in.");
  }

  try {
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid credentials");
      } else if (response.status === 404 && authentication_type === "login") {
        throw new Error(
          "User does not exist! Ensure that you have the correct credentials!",
        );
      } else if (
        response.status === 409 &&
        authentication_type === "register"
      ) {
        throw new Error("Conflict; user already exists!");
      } else if (response.status === 403) {
        let errorMessage =
          "Action not allowed while signed in as another user. Please log out first.";
        try {
          const body: unknown = await response.json();
          if (
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof (body as Record<string, unknown>).message === "string"
          ) {
            errorMessage = (body as Record<string, unknown>).message as string;
          }
        } catch {
          /* use default message */
        }
        throw new Error(errorMessage);
      }
      throw new Error(
        `Failed to authenticate (response status ${response.status})`,
      );
    }

    const parsed_auth_response = await authenticateResultSchema.safeParseAsync(
      await response.json(),
    );

    if (!parsed_auth_response.success) {
      throw new Error(parsed_auth_response.error.errors.join(", "));
    }
    const data: AuthenticateResult = parsed_auth_response.data;

    if (data.kind === "failure") {
      throw new Error(data.message);
    }

    return data;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Invalid credentials")) {
      throw new Error("Invalid credentials");
    }
    if (e instanceof Error && e.message.includes("already signed in")) {
      throw e;
    }
    console.error("Failed to parse authentication response: ", e);
    throw new Error("Failed to parse authentication response");
  }
}
