import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  inviteCodeFormatSchema,
  type InviteCodeDefinition,
  passwordSchema,
} from "@schemavaults/auth-common";
import { hashPassword } from "@/lib/hash_password";
import isValidUuid from "@/lib/is-valid-uuid";
import loadSuperuserInviteCode, { superuserInviteCodeEnvVarKey } from "@/lib/SuperuserInviteCode";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import isValidEmail from "@/lib/is-valid-email";
import type { ICreateUserOptions } from "./ICreateUserOptions";
import { userDocumentSchema, type UserDocument } from "./parse-user-document";
import lookupInviteCode from "./lookup-invite-code";
import countInviteCodeUsages from "./count-invite-code-usages";
import doesSomeAdminUserExist from "./does-some-admin-user-exist";

/**
 * @name createUser
 * @param db Database connection or transaction
 * @param opts ICreateUserOptions
 * @param debug Enable debug logging
 * @returns A copy of the user document that was inserted into the database.
 */
export async function createUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  { email, password, invite_code, ...opts }: ICreateUserOptions,
  debug: boolean = false
): Promise<UserDocument> {
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

  const inviteCodesRequiredPromise: Promise<boolean> = inviteCodesRequired(db);

  if (invite_code) {
    const parsed = await inviteCodeFormatSchema.safeParseAsync(invite_code);
    if (!parsed.success) {
      console.warn("Received invalid invite code!");
      if (debug) {
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
      `[createUser] Attempting to create ${create_as_admin ? "admin" : "regular"} user with email: `,
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
      `[createUser] Creating ${create_as_admin ? "admin" : "regular"} user: "${user.email}" with uid: "${user.uid}"`
      + user.invite_code ? ` [Invite code: ${user.invite_code}]` : " [No invite code provided]",
    );
  }

  let hashed_password: string;
  try {
    hashed_password = await hashPassword(password);
  } catch (e: unknown) {
    console.error("[createUser] Failed to hash password: ", e);
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
        `[createUser] Running database transaction to create user...`,
      );
    }

    // Run create user insert operation as a transaction
    // (multiple tables written to, need to ensure that max_uses is not exceeded for invite code so need consistency)
    await db
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

        if (typeof uid !== 'string') {
          throw new TypeError("Expected 'uid' to be a string!")
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
      `[createUser] Created user: "${user.email}" with uid: "${user.uid}"! [Invite code: ${user.invite_code}]`,
    );
  }

  return user;
}

export default createUser;
