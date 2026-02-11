import { appIdSchema, isHardcodedAppId } from "@schemavaults/app-definitions";
import { z } from "zod";

export const authorizeClientApplicationFormType = z
  .object({
    app_id: appIdSchema,
  })
  .required({
    app_id: true,
  })
  .strict()
  .refine((values): boolean => {
    if (isHardcodedAppId(values.app_id)) {
      return false;
    } else {
      return true;
    }
  }, "Hardcoded client applications are automatically pre-authorized!");

export default authorizeClientApplicationFormType;
