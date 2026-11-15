// Client-side calls of the `/device` page to the auth server's
// `/api/auth/device/*` endpoints (signed-in session cookie, same origin).

import type { AppConsentStatus } from "@schemavaults/auth-common";

/** `POST /api/auth/device/lookup`'s description of a pending request. */
export interface DeviceAuthorizationDetails {
  user_code: string;
  client_app: { app_id: string; app_name: string; app_description: string };
  created_at: number;
  expires_at: number;
  consent: AppConsentStatus;
}

/** Why a call was refused, in terms the page reacts to. */
export type DeviceVerificationFailure =
  | { kind: "invalid_user_code"; message: string }
  | { kind: "email_verification_required"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "signed_out"; message: string }
  | { kind: "error"; message: string };

export type DeviceVerificationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: DeviceVerificationFailure };

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function failureOf(status: number, body: Record<string, unknown> | null): DeviceVerificationFailure {
  const message: string =
    typeof body?.message === "string" ? body.message : "Something went wrong. Please try again.";
  if (body?.error_id === "invalid_user_code") {
    return { kind: "invalid_user_code", message };
  }
  if (body?.error_id === "email_verification_required") {
    return { kind: "email_verification_required", message };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      message: "Too many incorrect codes. Wait a few minutes, then try again.",
    };
  }
  if (status === 401) {
    return { kind: "signed_out", message: "Your session has ended. Sign in again to continue." };
  }
  return { kind: "error", message };
}

async function post<T>(
  path: string,
  body: Record<string, unknown>,
  parse: (json: Record<string, unknown>) => T,
): Promise<DeviceVerificationResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      failure: { kind: "error", message: "Could not reach the server. Check your connection and try again." },
    };
  }
  const json = await readJson(response);
  if (!response.ok || json === null || json.success !== true) {
    return { ok: false, failure: failureOf(response.status, json) };
  }
  return { ok: true, value: parse(json) };
}

export function lookupDeviceAuthorization(
  user_code: string,
): Promise<DeviceVerificationResult<DeviceAuthorizationDetails>> {
  return post("/api/auth/device/lookup", { user_code }, (json) => json as unknown as DeviceAuthorizationDetails);
}

export function approveDeviceAuthorization(
  user_code: string,
  approved_api_scopes: readonly string[],
): Promise<DeviceVerificationResult<null>> {
  return post(
    "/api/auth/device/approve",
    { user_code, approved_api_scopes: [...approved_api_scopes] },
    () => null,
  );
}

export function denyDeviceAuthorization(user_code: string): Promise<DeviceVerificationResult<null>> {
  return post("/api/auth/device/deny", { user_code }, () => null);
}
