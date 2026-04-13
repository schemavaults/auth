// 00014-email-verification-tokens-table.ts

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createEmailVerificationTokensTable(db: Kysely<any>) {
  const createTable = sql`
    CREATE TABLE IF NOT EXISTS EMAIL_VERIFICATION_TOKENS (
      token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      uid UUID NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at BIGINT,
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      CONSTRAINT fk_email_verification_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE
    );
  `;
  await createTable.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createEmailVerificationTokensTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('email_verification_tokens').execute();
}
