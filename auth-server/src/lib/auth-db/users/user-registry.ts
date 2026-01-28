import "server-only";

import { z } from "zod";
import {
  PKCE_ProofKeyManager,
  inviteCodeFormatSchema,
  type InviteCodeDefinition,
  inviteCodeDefinitionSchema,
  type InviteCode,
  UserData,
  passwordSchema,
} from "@schemavaults/auth-common";
import { hashPassword as saltAndHashPassword } from "@/lib/hash_password";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type PasswordRecord, passwordRecordSchema } from "./passwords-table";
import {
  type AuthorizationCodeRecord,
  authorizationCodeRecordSchema,
} from "./authorization-codes-table";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import isValidUuid from "@/lib/is-valid-uuid";
import loadSuperuserInviteCode, { superuserInviteCodeEnvVarKey } from "@/lib/SuperuserInviteCode";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import isValidEmail from "@/lib/is-valid-email";
import type { ICreateUserOptions } from "./ICreateUserOptions";
import lookupInviteCode from "./lookup-invite-code";
import countInviteCodeUsages from "./count-invite-code-usages";
import doesSomeAdminUserExist from "./does-some-admin-user-exist";

const userDocumentSchema = z
  .object({
    email: z.string().email(),
    email_verified: z.boolean().optional(),
    uid: z.string().uuid(),
    created_at: z.number().nonnegative(),
    invite_code: inviteCodeFormatSchema.optional(),
    admin: z.boolean().optional(),
    disabled: z.boolean().optional(),
  })
  .required({
    email: true,
    uid: true,
    created_at: true,
  })
  .strict();

export type UserDocument = z.infer<typeof userDocumentSchema>;

export class UserRegistry {
  private readonly debug: boolean;


  private static async parseUserDocument(row: unknown): Promise<UserDocument> {
    if (typeof row !== "object" || !row) {
      throw new Error("Invalid row type from DB");
    }

    if (!Object.hasOwn(row, "created_at")) {
      throw new Error(
        "Invalid user document from DB; missing created_at property",
      );
    }
    const parsed_user = await userDocumentSchema.safeParseAsync({
      ...row,
      created_at: parseInt((row as { created_at: string }).created_at),
    });
    if (!parsed_user.success) {
      console.error(
        "[UserRegistry::parseUserDocument]",
        parsed_user.error.errors,
      );
      throw new Error("Failed to parse user from database");
    }
    return parsed_user.data;
  }

  public async getUserByEmail(email: string): Promise<UserDocument | null> {
    if (this.env !== "production") {
      console.log("[UserRegistry] getUserByEmail: ", email);
    }

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("users")
        .where("email", "=", email)
        .limit(5)
        .select([
          "email",
          "email_verified",
          "admin",
          "created_at",
          "disabled",
          "invite_code",
          "uid",
        ])
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to query for user by email");
    }
    if (!Array.isArray(rows))
      throw new Error("Expected select result to be an array");

    if (rows.length === 0) {
      return null;
    } else if (rows.length > 1) {
      throw new Error("Multiple users found with the same email");
    }

    if (!rows[0]) return null;
    if (typeof rows[0] === "object" && Object.keys(rows[0]).length === 0) {
      return null;
    }

    if (typeof rows[0] !== "object")
      throw new Error("Expected user document to be an object");

    let parsed_user: UserDocument;
    try {
      parsed_user = await UserRegistry.parseUserDocument(rows[0]);
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to parse user document when getting user by email from user registry",
      );
    }

    if (this.env !== "production") {
      console.log("[UserRegistry] getUserByEmail success:", parsed_user);
    }

    return parsed_user;
  }

  public async getUserByUID(uid: string): Promise<UserDocument | null> {
    if (this.env !== "production") {
      console.log("[UserRegistry] getUserByUID: ", uid);
    }

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("users")
        .where("uid", "=", uid)
        .limit(5)
        .select([
          "email",
          "email_verified",
          "admin",
          "created_at",
          "disabled",
          "invite_code",
          "uid",
        ])
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to query for user by uid");
    }
    if (rows.length === 0) {
      return null;
    } else if (rows.length > 1) {
      console.error(`Multiple users found with the same uid`);
      throw new Error("Multiple users found with the same uid");
    }

    if (!rows[0]) return null;
    if (typeof rows[0] === "object" && Object.keys(rows[0]).length === 0) {
      return null;
    }

    if (typeof rows[0] !== "object")
      throw new Error("Expected user document to be an object");

    let parsed_user: UserDocument;
    try {
      parsed_user = await UserRegistry.parseUserDocument(rows[0]);
    } catch (e: unknown) {
      console.error("[UserRegistry::getUserByUID]", e);
      throw new Error(
        "Failed to parse user document when getting user by uid from user registry",
      );
    }

    if (this.env !== "production") {
      console.log("[UserRegistry] getUserByUID result: ", parsed_user);
    }

    return parsed_user;
  }

  /**
   * @name createUser
   * @param opts ICreateUserOptions
   * @returns A copy of the user document that was inserted into the database.
   */
  public async createUser({ email, password, invite_code, ...opts }: ICreateUserOptions): Promise<UserDocument> {
    const debug: boolean = this.debug;

    if (typeof email !== "string") {
      throw new TypeError("'email' must be a string");
    } else if (typeof password !== "string") {
      throw new TypeError("'password' must be a string");
    } else if (!isValidEmail(email)) {
      throw new TypeError("'email' is invalid!")
    } else if (!passwordSchema.safeParse(password).success) {
      throw new TypeError("'password' is invalid!")
    }

    if (typeof invite_code !== "string" && typeof invite_code !== "undefined") {
      throw new TypeError("'invite_code' must be a string (if passed)");
    }

    const inviteCodesRequiredPromise: Promise<boolean> = inviteCodesRequired(this.db);

    if (invite_code) {
      const parsed = await inviteCodeFormatSchema.safeParseAsync(invite_code);
      if (!parsed.success) {
        console.warn("Received invalid invite code!");
        if (this.debug) {
          console.error(parsed.error);
        }
        throw new TypeError("Received invalid invite code!")
      }
    }

    const SUPERUSER_INVITE_CODE: string | undefined = loadSuperuserInviteCode();
    const IS_SUPERUSER_INVITE_CODE_PROVIDED: boolean = (
      typeof SUPERUSER_INVITE_CODE === 'string' &&
      SUPERUSER_INVITE_CODE.length > 0 &&
      typeof invite_code === 'string' &&
      invite_code.length > 0 &&
      SUPERUSER_INVITE_CODE === invite_code
    );
    const create_as_admin = IS_SUPERUSER_INVITE_CODE_PROVIDED;
    if (typeof create_as_admin !== "boolean") {
      throw new TypeError("'create_as_admin' must be a boolean");
    }

    if (debug) {
      console.log(
        `[UserRegistry] Attempting to create ${create_as_admin ? "admin" : "regular"} user with email: `,
        email,
      );
    }

    const uid: string = typeof opts.uid === 'string' ? opts.uid : crypto.randomUUID();
    if (!isValidUuid(uid)) {
      throw new TypeError("Did not receive valid UUID for new user ID ('uid') in createUser()")
    }

    const created_at: number = Date.now();

    const parsed_user = await userDocumentSchema.safeParseAsync({
      email,
      email_verified: false,
      uid,
      invite_code,
      created_at,
      admin: IS_SUPERUSER_INVITE_CODE_PROVIDED,
      disabled: false,
    } satisfies UserDocument);
    if (!parsed_user.success) {
      console.error(parsed_user.error.errors);
      throw new Error("Failed to parse new user document");
    }
    const user: UserDocument = parsed_user.data;

    if (debug) {
      console.log(
        `[UserRegistry::createUser] Creating ${create_as_admin ? "admin" : "regular"} user: "${user.email}" with uid: "${user.uid}"`
        + user.invite_code ? ` [Invite code: ${user.invite_code}]` : " [No invite code provided]",
      );
    }

    let hashed_password: string;
    try {
      hashed_password = await UserRegistry.hashPassword(password);
    } catch (e: unknown) {
      console.error("[UserRegistry::createUser] Failed to hash password: ", e);
      throw new Error("Failed to hash password");
    }

    const inviteCodeRequired: boolean = await inviteCodesRequiredPromise;
    if (inviteCodeRequired && (
      !invite_code || !parsed_user.data.invite_code
    )) {
      throw new Error("No invite code was supplied but @schemavaults/auth-server config currently requires an invite code!")
    }

    try {
      if (debug) {
        console.log(
          `[UserRegistry::createUser] Running database transaction to create user...`,
        );
      }

      // Run create user insert operation as a transaction
      // (multiple tables written to, need to ensure that max_uses is not exceeded for invite code so need consistency)
      await this.db
        .transaction()
        .execute(async function createUserTransaction(trx): Promise<void> {
          let inviteCodeDefinition: InviteCodeDefinition | null;
          if (
            parsed_user.data.invite_code &&
            typeof parsed_user.data.invite_code === "string"
          ) {
            inviteCodeDefinition = await lookupInviteCode(
              trx,
              parsed_user.data.invite_code,
              debug
            );
            let maxInviteCodeUsages: number = 1;
            if (!inviteCodeDefinition) {
              if (!IS_SUPERUSER_INVITE_CODE_PROVIDED) {
                throw new Error(
                  "Failed to find invite code definition specified to create user with!"
                  + " " +
                  "Cannot verify that 'max_uses' has not been exceeded without finding the invite code definition!"
                );
              } else {
                // Superuser invite code is the only exception for codes that do not need to exist in the database to use them
                maxInviteCodeUsages = 1;
              }
            } else {
              // An invite code definition was defined
              maxInviteCodeUsages = inviteCodeDefinition.max_uses;

              const nInviteCodeUsages: number = await countInviteCodeUsages(
                trx,
                parsed_user.data.invite_code,
                debug
              );
              if (nInviteCodeUsages < maxInviteCodeUsages) {
                // this invite code still has usages remaining
              } else {
                throw new Error(
                  `Invite code '${inviteCodeDefinition.invite_code}' has exceeded its usage limit (${nInviteCodeUsages}/${maxInviteCodeUsages})!`,
                );
              }
            }
          }

          if (IS_SUPERUSER_INVITE_CODE_PROVIDED) {
            const someAdminAlreadyExists = await doesSomeAdminUserExist(trx, debug);
            if (someAdminAlreadyExists) {
              throw new Error(`Cannot use the superuser code from '${superuserInviteCodeEnvVarKey}' once an admin user already exists!`)
            }
          }

          await trx.insertInto("users").values(user).executeTakeFirstOrThrow();
          await trx
            .insertInto("passwords")
            .values({
              uid,
              password: hashed_password,
              created_at: user.created_at,
            })
            .executeTakeFirstOrThrow();
          if (invite_code && IS_SUPERUSER_INVITE_CODE_PROVIDED) {
            // Store that superuser invite code has been used
            await trx.insertInto("invite_codes")
              .values({
                max_uses: 1,
                created_by: uid,
                invite_code: invite_code,
                created_at,
                description: `Invite code created by superuser access code (set by environment variable '${superuserInviteCodeEnvVarKey}')`
              })
              .executeTakeFirstOrThrow();
          }
        });
    } catch (e: unknown) {
      console.error("Failed to insert new user into database", e);
      throw new Error("Failed to insert user into database");
    }

    if (debug) {
      console.log(
        `[UserRegistry::createUser] Created user: "${user.email}" with uid: "${user.uid}"! [Invite code: ${user.invite_code}]`,
      );
    }

    return user;
  }

  private static async hashPassword(password: string): Promise<string> {
    try {
      return await saltAndHashPassword(password);
    } catch (e: unknown) {
      console.error("Failed to hash password: ", e);
      throw new Error("Failed to hash password");
    }
  }

  private async loadPasswordRecord(
    uid: string,
  ): Promise<PasswordRecord | null> {
    if (this.env !== "production") {
      console.log(
        `[UserRegistry::loadPasswordRecord] Loading password for user with uid: "${uid}"`,
      );
    }

    let rows: PasswordRecord[];
    try {
      rows = await this.db
        .selectFrom("passwords")
        .where("uid", "=", uid)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(
        "Failed to look up password record for user with specified UID: ",
        e,
      );
      throw new Error(
        "Failed to look up password record for user with specified UID!",
      );
    }
    if (rows.length === 0) {
      return null;
    } else if (rows.length > 1) {
      throw new Error("Multiple passwords found with the same uid");
    }
    console.assert(
      rows.length === 1,
      "Expected exactly 1 password record row to have been retrieved by the database if this point was reached!",
    );

    const row = rows[0]!;
    const parsed_password_record = await passwordRecordSchema.safeParseAsync({
      ...row,
      created_at:
        typeof row.created_at === "number"
          ? row.created_at
          : parseInt(row.created_at as string),
    });
    if (!parsed_password_record.success) {
      console.error(parsed_password_record.error.errors);
      throw new Error("Failed to parse password record from database");
    }
    return parsed_password_record.data;
  }

  public async getPasswordHash(uid: string): Promise<string> {
    try {
      const password_record = await this.loadPasswordRecord(uid);
      if (!password_record) {
        console.error("No password record found for that uid");
        throw new Error("Failed to find a password hash for that user ID");
      }
      const password_hash: string = password_record.password;
      if (typeof password_hash !== "string") {
        throw new Error("Expected password hash to be a string!");
      }
      return password_hash;
    } catch (e: unknown) {
      console.error("Failed to retrieve password hash: ", e);
      throw new Error("Failed to retrieve password hash");
    }
  }

  public async comparePassword(
    uid: string,
    password: string,
  ): Promise<boolean> {
    if (this.debug) {
      console.log(
        `[UserRegistry::comparePassword] Attempting to compare input password against password saved in database`,
      );
    }

    try {
      const hashes: [string, string] = await Promise.all([
        this.getPasswordHash(uid),
        UserRegistry.hashPassword(password),
      ]);
      const isSubmittedSameAsTruth: boolean = hashes[0] === hashes[1];
      if (this.debug) {
        console.log(
          `[UserRegistry::comparePassword] Password ${isSubmittedSameAsTruth ? "is" : "is not"} the same`,
        );
      }
      return isSubmittedSameAsTruth;
    } catch (e: unknown) {
      console.error(
        "[UserRegistry::comparePassword] There was an error comparing passwords: ",
        e,
      );
      throw new Error("Error comparing passwords");
    }
  }

  // After a user has successfully logged in, generate an authorization code
  public async generateAuthorizationCode(
    uid: string,
    code_challenge: string,
    code_challenge_method: "S256",
    challenge_time: number,
  ): Promise<string> {
    if (this.debug) {
      console.log(
        "[UserRegistry] Attempting to generate authorization code...",
      );
    }

    if (code_challenge_method !== "S256") {
      throw new Error("Invalid code challenge method");
    }

    if (typeof challenge_time !== "number") {
      throw new Error("Expected 'challenge_time' to be a number");
    }

    if (this.env === "development") {
      console.log(`Generating authorization code for uid: ${uid}`);
    }

    let authorization_code: string;
    try {
      // Use PKCE_ProofKeyManager to generate a random code verifier
      const random_code: string =
        PKCE_ProofKeyManager.createCodeVerifier().code_verifier;
      authorization_code = random_code;
    } catch (e: unknown) {
      console.error("Failed to generate authorization code: ", e);
      throw new Error("Failed to generate authorization code");
    }

    if (this.env !== "production") {
      console.log(
        `Attempting to insert authorization code "${authorization_code}" for user "${uid}"`,
      );
    }

    // Store the authorization code in the database, with the code_challenge
    try {
      const authorization_code_row: AuthorizationCodeRecord = {
        authorization_code,
        uid,
        code_challenge,
        code_challenge_method,
        created_at: Date.now(),
        challenge_time,
      };

      if (this.env !== "production") {
        console.log(
          "Attempting to insert authorization code record: ",
          authorization_code_row,
        );
      }

      await this.db
        .insertInto("authorization_codes")
        .values(authorization_code_row)
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to store authorization code");
    }

    if (this.env !== "production") {
      console.log(
        `[UserRegistry::generateAuthorizationCode] Successfully created and stored authorization code for user with uid: "${uid}"`,
      );
    }

    return authorization_code;
  }

  public async validateAuthorizationCode(
    authorization_code: string,
    code_verifier: string,
    challenge_time: number,
  ): Promise<{ uid: string } | null> {
    if (this.debug) {
      console.log("[UserRegistry] Validating authorization code...");
    }

    let code_challenge_from_database: string;
    let uid: string;
    try {
      const rows = await this.db
        .selectFrom("authorization_codes")
        .where("authorization_code", "=", authorization_code)
        .selectAll()
        .execute();
      if (rows.length === 0) {
        if (this.debug) {
          console.error(
            "[UserRegistry] Authorization code row not found in database..",
          );
        }
        throw new Error("Authorization code not found");
      } else if (rows.length > 1) {
        if (this.debug) {
          console.error(
            "[UserRegistry] Multiple authorization codes found in database: ",
            rows,
          );
        }
        throw new Error(
          "Multiple authorization codes found with the same code",
        );
      }
      console.assert(
        rows.length === 1,
        "Expected exactly 1 authorization code row to have been received from the database if this point was reached!",
      );
      const row = rows[0]!;

      if (this.debug) {
        console.log(
          "[UserRegistry] Found authorization code row in database! Parsing...",
        );
      }

      const parsed_authorization_code =
        await authorizationCodeRecordSchema.safeParseAsync({
          ...row,
          created_at:
            typeof row.created_at === "number"
              ? row.created_at
              : parseInt(row.created_at),
          challenge_time:
            typeof row.challenge_time === "number"
              ? row.challenge_time
              : parseInt(row.challenge_time),
        });
      if (!parsed_authorization_code.success) {
        console.error(parsed_authorization_code.error.errors);
        throw new Error("Failed to parse authorization code from database");
      }
      code_challenge_from_database =
        parsed_authorization_code.data.code_challenge;
      uid = parsed_authorization_code.data.uid;
    } catch (e: unknown) {
      console.error("Failed to validate authorization code: ", e);
      throw new Error("Failed to validate authorization code");
    }

    if (this.debug) {
      console.log(
        "[UserRegistry] Successfully parsed authorization code record!",
      );
    }

    // Code verifier to be hashed with SHA-256
    let unverified_user_code_verifier: string;
    try {
      const codeVerifierSchema = PKCE_ProofKeyManager.codeVerifierSchema;
      const parsed = codeVerifierSchema.safeParse(code_verifier);
      if (!parsed.success) {
        if (this.debug) {
          console.error("[UserRegistry] Invalid code verifier", parsed.error);
        }
        throw parsed.error;
      }
      unverified_user_code_verifier = parsed.data;
    } catch (e: unknown) {
      console.error(
        "User supplied a code verifier that does not meet format standard: ",
        e,
      );
      throw new Error(
        "User supplied a code verifier that does not meet format standard!",
      );
    }

    let isValid: boolean = false;
    try {
      isValid = await PKCE_ProofKeyManager.doesVerifierMatchChallenge({
        input_code_verifier: unverified_user_code_verifier,
        saved_code_challenge: code_challenge_from_database,
        challenge_time,
      });
    } catch (e: unknown) {
      console.error(
        "Failed to hash code verifier, does not appear to match stored code_challenge: ",
        e,
      );
      throw new Error("Failed to hash code verifier");
    }

    if (!isValid) {
      throw new Error("Invalid code verifier");
    }

    return { uid };
  }

  public async promoteToAdmin(uid: string): Promise<void> {
    if (!isValidUuid(uid)) {
      throw new Error("Invalid user UUID to promote to admin!");
    }

    if (this.debug) {
      console.log(`[UserRegistry] promoteToAdmin(uid = "${uid}")`);
    }

    try {
      await this.db.transaction().execute(async () => {
        const setUserToAdminUpdateQuery = this.db
          .updateTable("users")
          .set({ admin: true })
          .where("uid", "=", uid);

        const updateResult = await setUserToAdminUpdateQuery.executeTakeFirst();
        if (!updateResult || typeof updateResult !== "object") {
          throw new Error("Expected 'updateResult' to be an object!");
        }
        const numRowsUpdated: number = Number(updateResult.numUpdatedRows);
        if (numRowsUpdated !== 1) {
          throw new Error(
            `Expected exactly one row to have been modified by superadmin promotion operation, but '${numRowsUpdated}' rows were updated!"`,
          );
        }
      });
    } catch (e: unknown) {
      console.error(`Failed to promote user '${uid}' to superuser/admin: `, e);
      throw new Error(`Failed to promote user ${uid} to superuser/admin!`);
    }

    if (this.debug) {
      console.log(
        `[UserRegistry] promoteToAdmin(uid = "${uid}") = Success! 🎉`,
      );
    }
  }

  private static isValidInviteCodeDefinition(
    maybe_invite_code_definition: object,
  ): maybe_invite_code_definition is InviteCodeDefinition {
    const parsed = inviteCodeDefinitionSchema.safeParse(
      maybe_invite_code_definition,
    );
    if (!parsed.success) {
      console.error("Invalid invite code definition: ", parsed.error);
      return false;
    }
    return true;
  }

  private static areValidInviteCodeDefinitions(
    maybe_invite_code_definitions: readonly object[],
  ): maybe_invite_code_definitions is readonly InviteCodeDefinition[] {
    if (!Array.isArray(maybe_invite_code_definitions)) {
      return false;
    }
    if (maybe_invite_code_definitions.length === 0) {
      return true;
    }
    if (
      !maybe_invite_code_definitions.every((maybe_invite_code_definition) =>
        UserRegistry.isValidInviteCodeDefinition(maybe_invite_code_definition),
      )
    ) {
      return false;
    }
    return true;
  }

  private readonly superuserInviteCode: string | undefined = loadSuperuserInviteCode();

  public async createInviteCode(
    invite_code_def: InviteCodeDefinition,
  ): Promise<void> {
    if (this.debug) {
      console.log(
        `[UserRegistry] createInviteCode(${JSON.stringify(invite_code_def)})`,
      );
    }

    if (!UserRegistry.isValidInviteCodeDefinition(invite_code_def)) {
      throw new Error(
        "Invalid invite code definition to insert into database!",
      );
    }

    const isSuperuserCode: boolean = typeof this.superuserInviteCode === 'string' ? this.superuserInviteCode === invite_code_def.invite_code : false;
    if (!isSuperuserCode && !invite_code_def.created_by) {
      throw new Error("A 'created_by' field must be set for each invite code definition.")
    }

    const insertInviteCodeQuery = this.db
      .insertInto("invite_codes")
      .values(invite_code_def satisfies InviteCodeDefinition);

    try {
      await insertInviteCodeQuery.execute();
    } catch (e: unknown) {
      console.error("Failed to insert invite code into database: ", e);
      throw new Error("Failed to insert invite code into database!");
    }
  }

  public async listAllInviteCodes(): Promise<readonly InviteCodeDefinition[]> {
    try {
      const allInviteCodesQuery = this.db
        .selectFrom("invite_codes")
        .selectAll();
      const allInviteCodesRaw = await allInviteCodesQuery.execute();
      const allInviteCodesParsed = allInviteCodesRaw.map((raw_invite_code) => {
        const withParsedFields = {
          ...raw_invite_code,
          created_at:
            typeof raw_invite_code.created_at === "number"
              ? raw_invite_code.created_at
              : Number.parseInt(raw_invite_code.created_at),
          max_uses:
            typeof raw_invite_code.max_uses === "number"
              ? raw_invite_code.max_uses
              : Number.parseInt(raw_invite_code.max_uses),
          created_by:
            typeof raw_invite_code.created_by === "number"
              ? raw_invite_code.created_by
              : typeof raw_invite_code.created_by === "string"
                ? Number.parseInt(raw_invite_code.created_by)
                : undefined,
        };
        if (!withParsedFields.created_by) {
          delete withParsedFields.created_by;
        }

        return withParsedFields;
      });
      if (!UserRegistry.areValidInviteCodeDefinitions(allInviteCodesParsed)) {
        throw new Error(
          "Failed to parse invite code definitions from database!",
        );
      }
      return allInviteCodesParsed;
    } catch (e: unknown) {
      console.error(
        "Failed to load invite code definitions from database: ",
        e,
      );
      throw new Error("Failed to load invite code definitions from database!");
    }
  }

  public async listAllUsers(): Promise<readonly UserDocument[]> {
    if (this.debug) {
      console.log("[UserRegistry] listAllUsers()");
    }

    try {
      const allUsersQuery = this.db
        .selectFrom("users")
        .select([
          "email",
          "email_verified",
          "admin",
          "created_at",
          "disabled",
          "invite_code",
          "uid",
        ])
        .orderBy("created_at", "desc");

      const allUsersRaw = await allUsersQuery.execute();
      const allUsersParsed: UserDocument[] = [];

      for (const raw_user of allUsersRaw) {
        const parsed_user = await UserRegistry.parseUserDocument(raw_user);
        allUsersParsed.push(parsed_user);
      }

      if (this.debug) {
        console.log(
          `[UserRegistry] listAllUsers() = ${allUsersParsed.length} users`,
        );
      }

      return allUsersParsed;
    } catch (e: unknown) {
      console.error("Failed to load users from database: ", e);
      throw new Error("Failed to load users from database!");
    }
  }

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
}
