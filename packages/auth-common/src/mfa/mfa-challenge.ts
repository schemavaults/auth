import { z } from "zod";

export const mfaChallengeSchema = z
  .object({
    challenge_id: z.string().uuid(),
    expires_at: z.number().int().positive(),
  })
  .strict();

export type MfaChallengeDescriptor = z.infer<typeof mfaChallengeSchema>;
