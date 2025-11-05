import {
  emailCredentialsSchema,
  inviteCodeFormatSchema,
  passwordSchema,
} from "@schemavaults/auth";

export const credentialsSchema = emailCredentialsSchema
  .extend({
    confirm: passwordSchema.optional(),
    invite_code: inviteCodeFormatSchema.optional(),
  })
  .refine((data): boolean => {
    if (typeof data.confirm === "string" && data.password !== data.confirm) {
      return false;
    }
    return true;
  }, "Passwords do not match");

export default credentialsSchema;
