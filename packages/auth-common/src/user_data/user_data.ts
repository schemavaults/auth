import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerAppId,
  type AppId,
} from "@schemavaults/app-definitions";
import { inviteCodeFormatSchema } from "@/invite-code/invite-code-format";
import { formatOidcSubClaim, parseOidcSubClaim } from "@/oidc/sub-claim";
import {
  usernameFormatSchema,
  userNamePartSchema,
  userDisplayNameSchema,
} from "@/user_data/user_profile";
import { z } from "zod";

// `UserData.sub` is the OIDC-facing subject `<auth_server_app_id>|<uid>`
// (see oidc/sub-claim.ts), the same value the id_token, userinfo and
// introspection report. It used to duplicate the bare uid, and bare uids
// still arrive from older auth servers' JSON responses and from cached user
// data, so parsing upgrades them lazily: a bare uuid is prefixed with the
// auth server app id before validation. The platform's encrypted access /
// refresh tokens keep `sub === uid` on the wire (see @schemavaults/jwt
// payload_data.ts); customJwtPayloadToUserData builds the OIDC form when it
// turns a decoded token into UserData.

/**
 * Where the prefix for a lazily-upgraded bare-uuid `sub` comes from: an app
 * id, or a function resolving one at parse time.
 */
export type UserDataAuthServerAppIdSource = AppId | (() => AppId);

export interface CreateUserDataSchemaOptions {
  /**
   * The auth server app id that prefixes a bare-uuid `sub`. Defaults to
   * `getAuthServerAppId()` (SCHEMAVAULTS_AUTH_SERVER_APP_ID) resolved at
   * parse time; runtimes without `process.env` (browsers) fall back to
   * DEFAULT_AUTH_SERVER_APP_ID, so client code should pass the app id it
   * was configured with.
   */
  auth_server_app_id?: UserDataAuthServerAppIdSource;
}

function resolveDefaultAuthServerAppId(): AppId {
  if (typeof process === "undefined" || typeof process.env !== "object") {
    return DEFAULT_AUTH_SERVER_APP_ID;
  }
  return getAuthServerAppId();
}

const bareUidSchema = z.guid();

/** True for a `<app_id>|<uuid>` subject. */
export function isUserDataSubClaim(sub: unknown): sub is string {
  if (typeof sub !== "string") {
    return false;
  }
  const parsed = parseOidcSubClaim(sub);
  return parsed !== null && bareUidSchema.safeParse(parsed.uid).success;
}

/**
 * The OIDC form of a UserData subject: a bare uuid (the pre-OIDC `sub`, equal
 * to the uid) is prefixed with `auth_server_app_id`; a `<app_id>|<uuid>`
 * subject is returned unchanged, whatever its prefix (`iss` pins the
 * deployment, and resource servers often keep the default app id against
 * white-label auth servers). Returns null for anything else.
 */
export function toUserDataSubClaim(
  sub: unknown,
  auth_server_app_id: UserDataAuthServerAppIdSource = resolveDefaultAuthServerAppId,
): string | null {
  if (isUserDataSubClaim(sub)) {
    return sub;
  }
  if (typeof sub === "string" && bareUidSchema.safeParse(sub).success) {
    const app_id: AppId =
      typeof auth_server_app_id === "function"
        ? auth_server_app_id()
        : auth_server_app_id;
    return formatOidcSubClaim(app_id, sub);
  }
  return null;
}

/** The uid a UserData subject names (either form), or null. */
export function uidFromUserDataSubClaim(sub: unknown): string | null {
  if (typeof sub !== "string") {
    return null;
  }
  if (bareUidSchema.safeParse(sub).success) {
    return sub;
  }
  return isUserDataSubClaim(sub) ? parseOidcSubClaim(sub)!.uid : null;
}

function createUserDataSubSchema(
  auth_server_app_id: UserDataAuthServerAppIdSource,
) {
  return z.preprocess(
    (value: unknown): unknown =>
      typeof value === "string" && bareUidSchema.safeParse(value).success
        ? toUserDataSubClaim(value, auth_server_app_id)
        : value,
    z
      .string()
      .refine(
        isUserDataSubClaim,
        "Expected an OIDC subject in '<auth_server_app_id>|<uid>' form",
      )
      .describe(
        "OIDC subject `<auth_server_app_id>|<uid>`, matching the id_token, userinfo and introspection `sub`. A bare uuid (older auth servers) is accepted and upgraded.",
      ),
  );
}

function createBaseUserDataSchema(
  auth_server_app_id: UserDataAuthServerAppIdSource,
) {
  return z
    .object({
      // User ID
      uid: z.guid(),
      // OIDC subject `<auth_server_app_id>|<uid>`; a bare uuid is upgraded.
      sub: createUserDataSubSchema(auth_server_app_id),

      // Email
      email: z.email(),
      email_verified: z.boolean().optional(),

      // Profile names (user-editable; absent for accounts that never set
      // them). Only present when the UserData was built from the database
      // row (loadUserData) — UserData derived from a decoded token payload
      // does not carry them.
      username: usernameFormatSchema.optional(),
      first_name: userNamePartSchema.optional(),
      middle_name: userNamePartSchema.optional(),
      last_name: userNamePartSchema.optional(),
      display_name: userDisplayNameSchema.optional(),

      // Admin
      admin: z.boolean().optional(),

      // Phone
      phone_number: z.string().min(10).max(15).optional(),
      phone_verified: z.boolean().optional(),

      // Account Disabled / Banned
      disabled: z.boolean().optional(),

      // Service account: a machine identity owned by a client application
      // (minted through the OAuth2 client_credentials grant) rather than a
      // person. Absent/false for every human account.
      service_account: z.boolean().optional(),

      // Creation Timestamp
      created_at: z.number().int().positive(),

      // Invite code
      invite_code: inviteCodeFormatSchema.optional(),
    })
    .required({
      uid: true,
      email: true,
      sub: true,
      created_at: true,
    })
    .strict();
}

/**
 * The UserData schema, upgrading a bare-uuid `sub` with the given (or the
 * environment's) auth server app id. Client SDKs build theirs with the app id
 * they were configured with.
 */
export function createUserDataSchema(
  options: CreateUserDataSchemaOptions = {},
) {
  return createBaseUserDataSchema(
    options.auth_server_app_id ?? resolveDefaultAuthServerAppId,
  ).refine((data) => {
    return parseOidcSubClaim(data.sub)?.uid === data.uid;
  }, "User ID fields do not match");
}

export const userDataSchema = createUserDataSchema();

export type UserData = z.infer<typeof userDataSchema>;
