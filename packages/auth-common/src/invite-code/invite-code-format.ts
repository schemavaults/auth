import { z } from "zod";

const MIN_INVITE_CODE_LENGTH: number = 8;
const MAX_INVITE_CODE_LENGTH: number = 64;

export const inviteCodeFormatSchema = z
  .string()
  .min(
    MIN_INVITE_CODE_LENGTH,
    `Invite code must be at least ${MIN_INVITE_CODE_LENGTH} characters long!`,
  )
  .max(
    MAX_INVITE_CODE_LENGTH,
    `Invite code may not be longer than ${MAX_INVITE_CODE_LENGTH} characters long!`,
  )
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Invite code may only contain alphanumeric characters, hyphens, or underscores!",
  );

export type InviteCode = z.infer<typeof inviteCodeFormatSchema>;
