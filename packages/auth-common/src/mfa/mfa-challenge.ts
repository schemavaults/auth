import { z } from "zod";

export const mfaChallengeSchema = z
  .object({
    challenge_id: z.guid(),
    expires_at: z.number().int().positive(),
  })
  .strict();

export type MfaChallengeDescriptor = z.infer<typeof mfaChallengeSchema>;
