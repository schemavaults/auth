import "server-only";

import {
  apiServerDomainVerificationMethodSchema,
  type ApiServerDomainVerificationMethod,
} from "@schemavaults/app-definitions";

/**
 * A domain registration with its ownership verification (migration 00057),
 * as the verification helpers read it.
 */
export interface ApiServerDomainVerificationRow {
  api_server_domain_ref_id: string;
  api_server_id: string;
  domain: string;
  environment: string;
  verification_token: string;
  /** Epoch ms; null while pending. */
  verified_at: number | null;
  verification_method: ApiServerDomainVerificationMethod | null;
}

/** The columns {@link parseApiServerDomainVerificationRow} reads. */
export const API_SERVER_DOMAIN_VERIFICATION_COLUMNS = [
  "api_server_domain_ref_id",
  "api_server_id",
  "domain",
  "environment",
  "verification_token",
  "verified_at",
  "verification_method",
] as const;

interface RawVerificationRow {
  api_server_domain_ref_id: string;
  api_server_id: string;
  domain: string;
  environment: string;
  verification_token: string;
  verified_at: number | string | null;
  verification_method: string | null;
}

/**
 * @description Normalizes a selected row: BIGINT `verified_at` may come back
 * as a string, and a row is only reported verified when both verification
 * columns are set (the CHECK constraint keeps them in step; this keeps a
 * half-set row from ever counting as verified).
 */
export function parseApiServerDomainVerificationRow(
  row: RawVerificationRow,
): ApiServerDomainVerificationRow {
  const verified_at_number: number | null =
    row.verified_at === null
      ? null
      : typeof row.verified_at === "string"
        ? Number.parseInt(row.verified_at, 10)
        : row.verified_at;
  const method = apiServerDomainVerificationMethodSchema.safeParse(row.verification_method);
  const verified: boolean =
    verified_at_number !== null && Number.isFinite(verified_at_number) && method.success;
  return {
    api_server_domain_ref_id: row.api_server_domain_ref_id,
    api_server_id: row.api_server_id,
    domain: row.domain,
    environment: row.environment,
    verification_token: row.verification_token,
    verified_at: verified ? verified_at_number : null,
    verification_method: verified && method.success ? method.data : null,
  };
}
