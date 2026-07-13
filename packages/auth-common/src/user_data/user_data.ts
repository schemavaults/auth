import { inviteCodeFormatSchema } from "@/invite-code/invite-code-format";
import { z } from "zod";

const _baseUserDataSchema = z
  .object({
    // User ID
    uid: z.string().uuid(),
    sub: z.string().uuid(), // duplicate of uid

    // Email
    email: z.string().email(),
    email_verified: z.boolean().optional(),

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

    // Space-delimited granted scopes carried on the access/refresh token
    // this UserData was decoded from (see the `scope` claim in
    // @schemavaults/jwt payload_data.ts). Absent for UserData loaded from
    // the database and for tokens issued before scopes became
    // first-class, so route guards treat a missing value as "no scopes
    // granted".
    scope: z.string().max(256).optional(),
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
