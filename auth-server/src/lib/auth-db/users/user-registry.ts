import "server-only";

import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ICreateUserOptions } from "./ICreateUserOptions";

// Import extracted functions
import { getUserByEmail as getUserByEmailFn } from "./get-user-by-email";
import { getUserByUID as getUserByUIDFn } from "./get-user-by-uid";
import { listAllUsers as listAllUsersFn } from "./list-all-users";
import { getPasswordHash as getPasswordHashFn } from "./get-password-hash";
import { comparePassword as comparePasswordFn } from "./compare-password";
import { generateAuthorizationCode as generateAuthorizationCodeFn } from "./generate-authorization-code";
import { validateAuthorizationCode as validateAuthorizationCodeFn } from "./validate-authorization-code";
import { createInviteCode as createInviteCodeFn } from "./create-invite-code";
import { listAllInviteCodes as listAllInviteCodesFn } from "./list-all-invite-codes";
import { promoteToAdmin as promoteToAdminFn } from "./promote-to-admin";
import { createUser as createUserFn } from "./create-user";

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

  public async comparePassword(uid: string, password: string): Promise<boolean> {
    return comparePasswordFn(this.db, uid, password, this.debug);
  }

  public async generateAuthorizationCode(
    uid: string,
    code_challenge: string,
    code_challenge_method: "S256",
    challenge_time: number,
  ): Promise<string> {
    return generateAuthorizationCodeFn(
      this.db,
      uid,
      code_challenge,
      code_challenge_method,
      challenge_time,
      this.debug
    );
  }

  public async validateAuthorizationCode(
    authorization_code: string,
    code_verifier: string,
    challenge_time: number,
  ): Promise<{ uid: string } | null> {
    return validateAuthorizationCodeFn(
      this.db,
      authorization_code,
      code_verifier,
      challenge_time,
      this.debug
    );
  }

  public async promoteToAdmin(uid: string): Promise<void> {
    return promoteToAdminFn(this.db, uid, this.debug);
  }

  public async createInviteCode(invite_code_def: InviteCodeDefinition): Promise<void> {
    return createInviteCodeFn(this.db, invite_code_def, this.debug);
  }

  public async listAllInviteCodes(): Promise<readonly InviteCodeDefinition[]> {
    return listAllInviteCodesFn(this.db, this.debug);
  }

  /**
   * @name createUser
   * @param opts ICreateUserOptions
   * @returns A copy of the user document that was inserted into the database.
   */
  public async createUser(opts: ICreateUserOptions): Promise<UserDocument> {
    return createUserFn(this.db, opts, this.debug);
  }
}
