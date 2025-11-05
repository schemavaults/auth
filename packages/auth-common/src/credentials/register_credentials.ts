import { emailCredentialsSchema } from "./email_credentials";
import { passwordSchema } from "./password_requirements";
import {z} from 'zod';

export const emailRegistrationCredentialsSchema = emailCredentialsSchema.extend({
  confirm: passwordSchema,
  invite_code: z.string().min(5, "Invite code must be at least 5 characters long.")
}).required({
  confirm: true,
  invite_code: true
}).strict().refine((data) => {
  return data.password === data.confirm;
}, "Passwords do not match");

export type EmailRegistrationCredentials = z.infer<typeof emailRegistrationCredentialsSchema>;
