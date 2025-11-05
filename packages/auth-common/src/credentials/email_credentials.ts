import { z } from 'zod';
import { passwordSchema } from './password_requirements';

export const emailCredentialsSchema = z.object({
  email: z.string().email(),
  password: passwordSchema
}).required({
  email: true,
  password: true
}).strict();

export type EmailCredentials = z.infer<typeof emailCredentialsSchema>;
