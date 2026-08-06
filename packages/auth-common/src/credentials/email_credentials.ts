import { z } from 'zod';
import { passwordSchema } from './password_requirements';
import { normalizedEmailSchema } from './normalize-email';

export const emailCredentialsSchema = z.object({
  email: normalizedEmailSchema,
  password: passwordSchema
}).required({
  email: true,
  password: true
}).strict();

export type EmailCredentials = z.infer<typeof emailCredentialsSchema>;
