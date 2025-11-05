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
