// 00051-user-mfa-factors-last-used-totp-step.ts
// Adds `last_used_totp_step` to USER_MFA_FACTORS: the RFC 6238 time step
// (T = floor(unix seconds / 30)) of the last TOTP code the factor's
// owner got accepted. A code is accepted only for a step later than this
// one (lib/mfa/consume-totp-code.ts), so an observed or phished code
// cannot be replayed while it is still inside the ±1 step drift window
// (RFC 6238 §5.2: the verifier MUST NOT accept the second attempt of
// the same OTP).
//
// NULL means no code was accepted since the column was added (a new
// factor, a passkey factor, or a factor enrolled before this migration).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USER_MFA_FACTORS
      ADD COLUMN IF NOT EXISTS last_used_totp_step BIGINT
      CHECK (last_used_totp_step IS NULL OR last_used_totp_step >= 0);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USER_MFA_FACTORS DROP COLUMN IF EXISTS last_used_totp_step;
  `.execute(db);
}
