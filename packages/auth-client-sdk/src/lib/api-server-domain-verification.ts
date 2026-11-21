import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  apiServerDomainVerificationSchema,
  apiServerIdSchema,
  type ApiServerDomainVerification,
  type ApiServerDomainVerificationMethod,
  type ApiServerId,
} from "@schemavaults/app-definitions";
import { z } from "zod";

/** Why a verification attempt left the domain unverified. */
export const API_SERVER_DOMAIN_VERIFICATION_ERRORS = [
  "verification_record_not_found",
  "domain_not_dns_verifiable",
  "dns_lookup_failed",
] as const;

export type ApiServerDomainVerificationError =
  (typeof API_SERVER_DOMAIN_VERIFICATION_ERRORS)[number];

/** The auth server's answer to a domain verification attempt. */
export interface ApiServerDomainVerificationAttempt {
  /** Whether the domain's ownership is verified. */
  verified: boolean;
  /** Why it is not (absent when verified). */
  error?: ApiServerDomainVerificationError;
  message: string;
  /** The domain's current verification state. */
  verification: ApiServerDomainVerification;
}

const attemptResponseSchema = z
  .object({
    success: z.boolean(),
    error: z.enum(API_SERVER_DOMAIN_VERIFICATION_ERRORS).optional(),
    message: z.string(),
    verification: apiServerDomainVerificationSchema,
  })
  .loose();

/** Statuses whose body is a verification attempt rather than a refusal. */
const ATTEMPT_STATUSES: ReadonlySet<number> = new Set([200, 422, 503]);

function messageOf(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { message?: unknown }).message === "string" &&
    (body as { message: string }).message.length > 0
  ) {
    return (body as { message: string }).message;
  }
  return fallback;
}

export interface IVerifyApiServerDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  api_server_domain_ref_id: string;
  /**
   * `dns_txt` (default): the auth server looks up the domain's TXT record.
   * `administrator`: attest the domain without DNS (platform administrators only).
   */
  method?: ApiServerDomainVerificationMethod;
}

/**
 * @description `POST /api/apis/[api_server_id]/domains/[api_server_domain_ref_id]/verify`
 * — asks the auth server to verify that the API server's managers control a
 * registered domain. Verified domains take precedence in RFC 8707
 * resource-URL resolution, and are the only ones that resolve once the auth
 * server requires verification. Publish the TXT record the domain's
 * verification state names (`verification.dns_txt_record`) first, and keep it
 * published. A domain left unverified (record not published yet, a host DNS
 * cannot verify, DNS not answering) is a normal outcome, returned with
 * `verified: false` and the reason in `error`; refusals (not a manager, no
 * such domain, rate limited) throw.
 */
export async function verifyApiServerDomain({
  adapter,
  auth_server_uri,
  api_server_id,
  api_server_domain_ref_id,
  method,
}: IVerifyApiServerDomainOpts): Promise<ApiServerDomainVerificationAttempt> {
  await apiServerIdSchema.parseAsync(api_server_id);
  await z.guid().parseAsync(api_server_domain_ref_id);

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/domains/${api_server_domain_ref_id}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(method ? { method } : {}),
      credentials: "include",
    },
  );

  const body: unknown = await response.json().catch(() => null);
  if (!ATTEMPT_STATUSES.has(response.status)) {
    throw new Error(
      `Failed to verify API server domain: ${messageOf(body, String(response.status))}`,
    );
  }
  const parsed = attemptResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("API server domain verification response was malformed", {
      cause: parsed.error,
    });
  }
  return {
    verified: parsed.data.success && parsed.data.verification.verified,
    ...(parsed.data.error ? { error: parsed.data.error } : {}),
    message: parsed.data.message,
    verification: parsed.data.verification,
  };
}

export interface IListApiServerDomainVerificationsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
}

/**
 * @description The verification state of each domain registered for an API
 * server (the `verifications` of `GET /api/apis/[api_server_id]/domains`),
 * matched to `listApiServerDomains()` by `api_server_domain_ref_id`.
 */
export async function listApiServerDomainVerifications({
  adapter,
  auth_server_uri,
  api_server_id,
}: IListApiServerDomainVerificationsOpts): Promise<ApiServerDomainVerification[]> {
  await apiServerIdSchema.parseAsync(api_server_id);

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/domains`,
    { method: "GET", credentials: "include" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Failed to list API server domain verifications: ${messageOf(body, String(response.status))}`,
    );
  }
  const parsed = z
    .object({
      success: z.literal(true),
      verifications: z.array(apiServerDomainVerificationSchema),
    })
    .loose()
    .safeParse(body);
  if (!parsed.success) {
    throw new Error("API server domain verifications response was malformed", {
      cause: parsed.error,
    });
  }
  return parsed.data.verifications;
}
