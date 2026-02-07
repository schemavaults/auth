import { z } from "zod";
import {
  appIdSchema,
} from "@schemavaults/app-definitions";

export const authorizedAppDeclarationSchema = z
  .object({
    user_app_authorization_id: z.string().uuid(),
    app_id: appIdSchema,
    authorized_at: z.number().nonnegative(),
    uid: z.string().uuid(),
  })
  .required({
    user_app_authorization_id: true,
    app_id: true,
    authorized_at: true,
    uid: true,
  })
  .strict();

export type AuthorizedAppDeclaration = z.infer<
  typeof authorizedAppDeclarationSchema
>;
