import { z } from "zod";
import { hardcodedAppIdSchema } from "./hardcoded-core-schemavaults-apps";

export const appIdSchema = z.union([
  z.string().uuid(), // dynamically defined app
  hardcodedAppIdSchema,
] as const);

export type AppId = z.infer<typeof appIdSchema>;
