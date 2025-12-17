import { z } from "zod";
import { inviteCodeFormatSchema } from "./invite-code-format";

const MAX_DESCRIPTION_LENGTH: number = 128;

export const inviteCodeDefinitionSchema = z
  .object({
    invite_code: inviteCodeFormatSchema,
    created_at: z.number().nonnegative(),
    max_uses: z.number().int().positive(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    created_by: z.string().uuid().optional(),
  })
  .required({
    invite_code: true,
    created_at: true,
    max_uses: true,
  })
  .strict();

export type InviteCodeDefinition = z.infer<typeof inviteCodeDefinitionSchema>;
