import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
  authenticateResultSchema,
} from "@schemavaults/auth-common";
import type {
  IAuthClientPOSTResultType,
  ISchemaVaultsAuthClientAdapter,
} from "@/types/ISchemaVaultsAuthClientAdapter";
import { credentialsSchema } from "@/lib/credentials-schema";
import {
  isValidAuthenticationOutcomeType,
  type AuthenticationOutcomeType,
} from "./authentication-outcome-type";
import type { ISendAuthenticateRequestOptions } from "@/types/ISendAuthenticateRequestOptions";
import type { Credentials } from "@/types/credentials";

// Send an authentication request to the auth server, hopefully get an authorization code back, else throw an error
export async function sendAuthenticateRequest(
  opts: ISendAuthenticateRequestOptions,
): Promise<string> {
  const credentials: Credentials = opts.credentials;
  const code_challenge: CodeChallengeWithDetails = opts.code_challenge;
  const authentication_type: AuthenticationOutcomeType =
    opts.authentication_type;
  const adapter: ISchemaVaultsAuthClientAdapter = opts.adapter;
  const env = opts.app_environment;

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

  const auth_request_body = {
    credentials: {
      email: credentials.email,
      password: credentials.password,
    },
    invite_code: credentials.invite_code,
    code_challenge: code_challenge.code_challenge,
    challenge_time: code_challenge.challenge_time,
  };

  let response: IAuthClientPOSTResultType<object>;
  try {
    if (env === "development") {
      console.log("[sendAuthenticateRequest] Sending POST request via adapter");
    }
    const authentication_request_response: IAuthClientPOSTResultType<object> =
      await adapter.sendPOSTRequest(
        `/api/auth/${authentication_type}`,
        auth_request_body,
        {},
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
      if (typeof response.data === "object" && response.data !== null) {
        if (
          "message" in response.data &&
          typeof response.data.message === "string"
        ) {
          errorMsg = response.data.message;
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
      }
      throw new Error("Failed to authenticate");
    }
    const response_body_json = response.data;

    const parsed_auth_response =
      await authenticateResultSchema.safeParseAsync(response_body_json);

    if (!parsed_auth_response.success) {
      throw new Error(parsed_auth_response.error.errors.join(", "));
    }
    const data = parsed_auth_response.data;

    if (!data.success) {
      throw new Error(data.message);
    }

    const authorization_code: string | undefined = data.authorization_code;

    if (typeof authorization_code !== "string") {
      throw new Error("Invalid authorization code");
    }

    return authorization_code satisfies string;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Invalid credentials")) {
      throw new Error("Invalid credentials");
    }
    console.error("Failed to parse authentication response: ", e);
    throw new Error("Failed to parse authentication response");
  }
}
