import { z } from "zod";

export const USERNAME_MIN_LENGTH: number = 3;
export const USERNAME_MAX_LENGTH: number = 32;

/**
 * Maximum length for each individual person-name part (first / middle /
 * last) and for the public display name.
 */
export const MAX_USER_NAME_PART_LENGTH: number = 64;

/**
 * Usernames are unique per deployment (case-insensitively — the database
 * enforces uniqueness on LOWER(username), while the stored casing is
 * preserved for display). Format: alphanumeric start and end with `.`,
 * `_`, and `-` permitted in between. `@` is deliberately excluded so a
 * username can never be confused with an email address, and `|` can
 * never appear (the OIDC sub-claim delimiter).
 */
export const USERNAME_REGEX: RegExp =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export const usernameFormatSchema = z
  .string()
  .min(
    USERNAME_MIN_LENGTH,
    `Username must be at least ${USERNAME_MIN_LENGTH} characters long!`,
  )
  .max(
    USERNAME_MAX_LENGTH,
    `Username may not be longer than ${USERNAME_MAX_LENGTH} characters!`,
  )
  .regex(
    USERNAME_REGEX,
    "Username may only contain letters, numbers, '.', '_', and '-', and must start and end with a letter or number.",
  );

export type Username = z.infer<typeof usernameFormatSchema>;

/**
 * Rejects ASCII control characters (including CR/LF) that could pollute
 * logs, headers, or rendered UI. All other unicode is permitted — names
 * are human text.
 */
// eslint-disable-next-line no-control-regex -- rejecting control chars is the point
const NO_CONTROL_CHARS_REGEX: RegExp = /^[^\u0000-\u001F\u007F]*$/;

const namePartSchema = z
  .string()
  .trim()
  .min(1)
  .max(
    MAX_USER_NAME_PART_LENGTH,
    `Name may not be longer than ${MAX_USER_NAME_PART_LENGTH} characters!`,
  )
  .regex(NO_CONTROL_CHARS_REGEX, "Name may not contain control characters!");

/** A single part of a user's personal name (first / middle / last). */
export const userNamePartSchema = namePartSchema;

/**
 * The user's public display name. Shown to other users and exposed to
 * OIDC relying parties as the `name` claim when the `profile` scope is
 * granted.
 */
export const userDisplayNameSchema = namePartSchema;

/**
 * The user-editable profile name fields stored on the USERS row. All
 * fields are optional — accounts predating this feature (and accounts
 * that never fill them in) simply have none set.
 */
export const userProfileNamesSchema = z
  .object({
    username: usernameFormatSchema.optional(),
    first_name: userNamePartSchema.optional(),
    middle_name: userNamePartSchema.optional(),
    last_name: userNamePartSchema.optional(),
    display_name: userDisplayNameSchema.optional(),
  })
  .strict();

export type UserProfileNames = z.infer<typeof userProfileNamesSchema>;

/**
 * PUT /api/user/profile request body. Full-replacement semantics: every
 * field the user wants to keep must be present; `null` (or an omitted
 * field) clears the stored value.
 */
export const updateUserProfileRequestSchema = z
  .object({
    username: usernameFormatSchema.nullable().optional(),
    first_name: userNamePartSchema.nullable().optional(),
    middle_name: userNamePartSchema.nullable().optional(),
    last_name: userNamePartSchema.nullable().optional(),
    display_name: userDisplayNameSchema.nullable().optional(),
  })
  .strict();

export type UpdateUserProfileRequest = z.infer<
  typeof updateUserProfileRequestSchema
>;

/** GET/PUT /api/user/profile success response body. */
export const userProfileResponseSchema = z
  .object({
    success: z.literal(true),
    profile: userProfileNamesSchema,
  })
  .strict();

export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
