import { appIdSchema } from "@schemavaults/app-definitions";
import { z } from "zod";

export const authorizeClientApplicationFormType = z
  .object({
    app_id: appIdSchema,
  })
  .required({
    app_id: true,
  })
  .strict();

export default authorizeClientApplicationFormType;
