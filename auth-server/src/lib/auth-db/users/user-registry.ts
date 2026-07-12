import "server-only";

import type { InviteCode, InviteCodeDefinition } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ICreateUserOptions } from "./ICreateUserOptions";

// Import extracted functions
import { getUserByEmail as getUserByEmailFn } from "./get-user-by-email";
import { getUserByUID as getUserByUIDFn } from "./get-user-by-uid";
import { listAllUsers as listAllUsersFn } from "./list-all-users";
import { getPasswordHash as getPasswordHashFn } from "./get-password-hash";
import {
  comparePassword as comparePasswordFn,
  type ComparePasswordResult,
} from "./compare-password";
import { upgradePasswordHash as upgradePasswordHashFn } from "./upgrade-password-hash";
import {
  generateAuthorizationCode as generateAuthorizationCodeFn,
  type OidcAuthorizationCodeContext,
} from "./generate-authorization-code";
import {
  validateAndConsumeAuthorizationCode as validateAndConsumeAuthorizationCodeFn,
  type ConsumedAuthorizationCode,
} from "./validate-and-consume-authorization-code";
import { createInviteCode as createInviteCodeFn } from "./create-invite-code";
import { listAllInviteCodes as listAllInviteCodesFn } from "./list-all-invite-codes";
import { countInviteCodeUsages as countInviteCodeUsagesFn } from "./count-invite-code-usages";
import { promoteToAdmin as promoteToAdminFn } from "./promote-to-admin";
import { setUserDisabled as setUserDisabledFn } from "./set-user-disabled";
import { createUser as createUserFn } from "./create-user";
import { createPasswordResetToken as createPasswordResetTokenFn } from "./create-password-reset-token";
import { validateAndConsumePasswordResetToken as validateAndConsumePasswordResetTokenFn } from "./validate-and-consume-password-reset-token";
import { createEmailVerificationToken as createEmailVerificationTokenFn } from "./create-email-verification-token";
import { validateAndConsumeEmailVerificationToken as validateAndConsumeEmailVerificationTokenFn } from "./validate-and-consume-email-verification-token";

// Re-export types and schema from parse-user-document
export { type UserDocument, userDocumentSchema } from "./parse-user-document";
import type { UserDocument } from "./parse-user-document";

/**
 * UserRegistry provides a class-based interface for user operations.
 * All methods delegate to standalone functional database scripts. This is a Facade.
 */
export class UserRegistry {
  private readonly debug: boolean;
  private readonly env: SchemaVaultsAppEnvironment;

  public constructor(
    protected readonly db: Kysely<AuthDatabase>,
    debug: boolean | undefined = undefined,
  ) {
    this.env = getAppEnvironment();

    const defaultDebugState: boolean =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";

    this.debug = typeof debug === "boolean" ? debug : defaultDebugState;
  }

  public async getUserByEmail(email: string): Promise<UserDocument | null> {
    return getUserByEmailFn(this.db, email, this.debug);
  }

  public async getUserByUID(uid: string): Promise<UserDocument | null> {
    return getUserByUIDFn(this.db, uid, this.debug);
  }

  public async listAllUsers(): Promise<readonly UserDocument[]> {
    return listAllUsersFn(this.db, this.debug);
  }

  public async getPasswordHash(uid: string): Promise<string> {
    return getPasswordHashFn(this.db, uid, this.debug);
  }

  public async comparePassword(uid: string, password: string): Promise<ComparePasswordResult> {
    return comparePasswordFn(this.db, uid, password, this.debug);
  }

  /**
   * Re-hash a plaintext password under the latest scheme and overwrite the
   * stored row. Only call this after the plaintext has been successfully
   * verified (e.g. right after a successful {@link comparePassword} that
   * reported `needsUpgrade: true`).
   */
  public async upgradePasswordHashIfNeeded(
    uid: string,
    plaintextPassword: string,
  ): Promise<void> {
    return upgradePasswordHashFn(this.db, uid, plaintextPassword, this.debug);
  }

  public async generateAuthorizationCode(
    uid: string,
    client_app_id: AppId,
    code_challenge: string,
    code_challenge_method: "S256",
    challenge_time: number,
    redirect_uri: string | null,
    oidc: OidcAuthorizationCodeContext | null = null,
  ): Promise<string> {
    return generateAuthorizationCodeFn(
      this.db,
      uid,
      client_app_id,
      code_challenge,
      code_challenge_method,
      challenge_time,
      redirect_uri,
      this.debug,
      oidc,
    );
  }

  /**
   * Atomically validates an OAuth2 PKCE authorization code and marks it
   * consumed. The code is single-use: subsequent calls with the same
   * `authorization_code` return `null`. Expired codes, codes with a
   * mismatched `code_verifier`, and codes whose stored `client_app_id`
   * does not match the supplied `client_app_id` all return `null`
   * without throwing.
   */
  public async validateAndConsumeAuthorizationCode(
    authorization_code: string,
    client_app_id: AppId,
    code_verifier: string,
    challenge_time: number | null,
    redirect_uri: string | null,
  ): Promise<ConsumedAuthorizationCode | null> {
    return validateAndConsumeAuthorizationCodeFn(
      this.db,
      authorization_code,
      client_app_id,
      code_verifier,
      challenge_time,
      redirect_uri,
      this.debug
    );
  }

  public async promoteToAdmin(uid: string): Promise<void> {
    return promoteToAdminFn(this.db, uid, this.debug);
  }

  public async setUserDisabled(uid: string, disabled: boolean): Promise<void> {
    return setUserDisabledFn(this.db, uid, disabled, this.debug);
  }

  public async createInviteCode(invite_code_def: InviteCodeDefinition): Promise<void> {
    return createInviteCodeFn(this.db, invite_code_def, this.debug);
  }

  public async listAllInviteCodes(): Promise<readonly InviteCodeDefinition[]> {
    return listAllInviteCodesFn(this.db, this.debug);
  }

  public async countInviteCodeUsages(invite_code: InviteCode): Promise<number> {
    return countInviteCodeUsagesFn(this.db, invite_code, this.debug);
  }

  /**
   * @name createUser
   * @param opts ICreateUserOptions
   * @returns A copy of the user document that was inserted into the database.
   */
  public async createUser(opts: ICreateUserOptions): Promise<UserDocument> {
    return createUserFn(this.db, opts, this.debug);
  }

  public async createPasswordResetToken(uid: string): Promise<string> {
    return createPasswordResetTokenFn(this.db, uid, this.debug);
  }

  /**
   * Atomically validates a password reset token, marks it consumed, and
   * writes the new password — all inside a single database transaction.
   * Returns `{ uid }` on success, or `null` for every reject case (token
   * not found, expired, already consumed, lost-race). The single-use
   * guarantee is enforced by a conditional `WHERE used_at IS NULL`
   * UPDATE; concurrent racers do not both succeed.
   */
  public async validateAndConsumePasswordResetToken(
    rawToken: string,
    newPassword: string,
  ): Promise<{ uid: string } | null> {
    return validateAndConsumePasswordResetTokenFn(
      this.db,
      rawToken,
      newPassword,
      this.debug,
    );
  }

  public async createEmailVerificationToken(uid: string): Promise<string> {
    return createEmailVerificationTokenFn(this.db, uid, this.debug);
  }

  /**
   * Atomically validates an email verification token, marks it consumed,
   * and flips `users.email_verified` — all inside a single database
   * transaction. Returns `{ uid }` on success, or `null` for every reject
   * case (token not found, expired, already consumed, lost-race).
   */
  public async validateAndConsumeEmailVerificationToken(
    rawToken: string,
  ): Promise<{ uid: string } | null> {
    return validateAndConsumeEmailVerificationTokenFn(
      this.db,
      rawToken,
      this.debug,
    );
  }
}
