import { z } from "zod";
import { hardcodedApiServerIdSchema } from "./hardcoded-core-schemavaults-api-servers";

export const apiServerIdSchema = z.union([
  z.string().uuid(), // dynamically defined api server
  hardcodedApiServerIdSchema,
]);

export type ApiServerId = z.infer<typeof apiServerIdSchema>;
