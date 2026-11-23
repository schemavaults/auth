import "server-only";

import type { ApiServerDomainVerification } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  getApiServerDomainVerificationRow,
  listDnsVerifiedDomainRowsOnHost,
  markApiServerDomainVerified,
  revokeDnsDomainVerifications,
  type ApiServerDomainRegistrationIdentity,
  type ApiServerDomainVerificationRow,
} from "@/lib/auth-db/api-server-domain-verifications";
import { buildDomainVerificationTxtRecord, getDnsVerifiableHostname } from "./dns-txt-record";
import { lookupTxtRecords, type TxtLookupResult } from "./lookup-txt-records";
import { planDnsVerification } from "./plan-dns-verification";
import { toApiServerDomainVerification } from "./to-api-server-domain-verification";

export type VerifyApiServerDomainOutcome =
  /** The registration is verified (now, or it already was). */
  | { kind: "verified"; verification: ApiServerDomainVerification }
  /** The TXT lookup answered, without the registration's record. */
  | { kind: "record_not_found"; verification: ApiServerDomainVerification }
  /** The host cannot be verified through DNS (loopback, IP literal, ...). */
  | { kind: "not_dns_verifiable"; verification: ApiServerDomainVerification }
  /** No authoritative DNS answer; nothing changed. */
  | { kind: "lookup_failed"; code: string; verification: ApiServerDomainVerification }
  /** The API server has no domain with that ref id. */
  | { kind: "not_found" }
  /**
   * The registration kept changing while it was being checked (every
   * attempt's final update found it changed); nothing was verified.
   */
  | { kind: "changed" };

export interface VerifyApiServerDomainOptions {
  api_server_id: string;
  api_server_domain_ref_id: string;
  /**
   * `dns_txt` (default): look the registration's TXT record up.
   * `administrator`: a platform administrator attests the registration
   * (callers must have checked that the requester is one).
   */
  method?: "dns_txt" | "administrator";
  /** TXT lookup to use (tests inject one); the system resolver by default. */
  lookup?: (name: string) => Promise<TxtLookupResult>;
  now?: number;
}

/**
 * How many times a verification is decided afresh when its final update
 * finds the registration changed (removed, replaced or verified meanwhile).
 */
export const MAX_VERIFICATION_ATTEMPTS = 3;

/** One attempt's final update found the registration changed: decide again. */
const CHANGED = Symbol("registration changed");

class RegistrationChangedError extends Error {
  constructor() {
    super("The domain registration changed while it was being verified");
    this.name = "RegistrationChangedError";
  }
}

function isSameRegistration(
  a: ApiServerDomainRegistrationIdentity,
  b: ApiServerDomainRegistrationIdentity,
): boolean {
  return (
    a.api_server_domain_ref_id === b.api_server_domain_ref_id &&
    a.api_server_id === b.api_server_id &&
    a.domain === b.domain &&
    a.verification_token === b.verification_token
  );
}

/**
 * The checked registration's state after the attempt's writes, or CHANGED
 * when it is gone, was replaced, or (`expect_verified`) is not verified
 * after all (a concurrent check revoked it): the attempt's outcome would
 * not describe it.
 */
async function reload(
  db: Kysely<AuthDatabase>,
  row: ApiServerDomainVerificationRow,
  expect_verified: boolean,
): Promise<ApiServerDomainVerification | typeof CHANGED> {
  const current = await getApiServerDomainVerificationRow(
    db,
    row.api_server_id,
    row.api_server_domain_ref_id,
  );
  if (!current || !isSameRegistration(current, row)) return CHANGED;
  const verification = toApiServerDomainVerification(current);
  if (expect_verified && !verification.verified) return CHANGED;
  return verification;
}

async function attemptVerification(
  db: Kysely<AuthDatabase>,
  {
    api_server_id,
    api_server_domain_ref_id,
    method,
    lookup,
    now,
  }: Required<VerifyApiServerDomainOptions>,
): Promise<VerifyApiServerDomainOutcome | typeof CHANGED> {
  const row = await getApiServerDomainVerificationRow(db, api_server_id, api_server_domain_ref_id);
  if (!row) return { kind: "not_found" };

  if (method === "administrator") {
    if (row.verified_at === null) {
      const marked: boolean = await markApiServerDomainVerified(db, row, "administrator", now);
      if (!marked) return CHANGED;
    }
    const verification = await reload(db, row, true);
    return verification === CHANGED ? CHANGED : { kind: "verified", verification };
  }

  const hostname: string | null = getDnsVerifiableHostname(row.domain);
  if (hostname === null) {
    return { kind: "not_dns_verifiable", verification: toApiServerDomainVerification(row) };
  }

  const record = buildDomainVerificationTxtRecord(hostname, row.verification_token);
  const answer: TxtLookupResult = await lookup(record.name);
  if (answer.kind === "lookup_failed") {
    return { kind: "lookup_failed", code: answer.code, verification: toApiServerDomainVerification(row) };
  }

  const others = await listDnsVerifiedDomainRowsOnHost(db, hostname);
  const plan = planDnsVerification({
    hostname,
    published_values: answer.kind === "records" ? answer.records : [],
    target: row,
    other_dns_verified: others,
  });
  // Revoked by ref id + the token the answer was judged against.
  const revocations = [row, ...others].filter((candidate) =>
    plan.revoke_ref_ids.includes(candidate.api_server_domain_ref_id),
  );

  try {
    await db.transaction().execute(async (trx) => {
      // A registration DNS already verified keeps its original time; one an
      // administrator attested is now backed by DNS too. The update only
      // applies to the registration that was looked up: when it changed
      // during the lookup, nothing of this attempt is written.
      if (plan.target_verified && row.verification_method !== "dns_txt") {
        const marked: boolean = await markApiServerDomainVerified(trx, row, "dns_txt", now);
        if (!marked) throw new RegistrationChangedError();
      }
      await revokeDnsDomainVerifications(trx, revocations);
    });
  } catch (e: unknown) {
    if (e instanceof RegistrationChangedError) return CHANGED;
    throw e;
  }

  const verification = await reload(db, row, plan.target_verified);
  if (verification === CHANGED) return CHANGED;
  return plan.target_verified
    ? { kind: "verified", verification }
    : { kind: "record_not_found", verification };
}

/**
 * @description Verifies that whoever registered a domain for an API server
 * controls it, so RFC 8707 resource URLs on the domain may resolve to the
 * API server.
 *
 * Through DNS, the registration's record (`_<app id>-domain-verification.<host>`
 * TXT `<app id>-domain-verification=<token>`, with this deployment's own app
 * id, e.g. `schemavaults-auth`) must be published. Every
 * authoritative answer also re-checks the host's other DNS verifications
 * and revokes those whose record is gone, the checked registration's own
 * included (see `planDnsVerification()`); a failed lookup changes nothing.
 *
 * The final update is conditional on the registration that was read (its
 * API server, domain and verification token, see
 * `markApiServerDomainVerified()`), so a lookup of one domain can never
 * verify another registration that took its ref id meanwhile. When the
 * update finds the registration changed, the verification is decided again
 * from a fresh read, up to {@link MAX_VERIFICATION_ATTEMPTS} times.
 */
export async function verifyApiServerDomain(
  db: Kysely<AuthDatabase>,
  {
    api_server_id,
    api_server_domain_ref_id,
    method = "dns_txt",
    lookup = (name: string) => lookupTxtRecords(name),
    now = Date.now(),
  }: VerifyApiServerDomainOptions,
): Promise<VerifyApiServerDomainOutcome> {
  for (let attempt = 0; attempt < MAX_VERIFICATION_ATTEMPTS; attempt++) {
    const outcome = await attemptVerification(db, {
      api_server_id,
      api_server_domain_ref_id,
      method,
      lookup,
      now,
    });
    if (outcome !== CHANGED) return outcome;
  }
  return { kind: "changed" };
}

export default verifyApiServerDomain;
