import { inviteCodeFormatSchema } from "@/invite-code/invite-code-format";
import {
  usernameFormatSchema,
  userNamePartSchema,
  userDisplayNameSchema,
} from "@/user_data/user_profile";
import { z } from "zod";

const _baseUserDataSchema = z
  .object({
    // User ID
    uid: z.string().uuid(),
    sub: z.string().uuid(), // duplicate of uid

    // Email
    email: z.string().email(),
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

export const userDataSchema = _baseUserDataSchema.refine((data) => {
  return data.uid === data.sub;
}, "User ID fields do not match");

export type UserData = z.infer<typeof userDataSchema>;
