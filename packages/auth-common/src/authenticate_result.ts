import { z } from "zod";

export const authenticateResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  authorization_code: z.string()
    .min(43, 'Authorization code must be at least 43 characters long')
    .optional()
}).required({
  success: true,
  message: true
}).strict();

export type AuthenticateResult = z.infer<typeof authenticateResultSchema>;
