import { z } from "zod";

export const apiServerIdSchema = z.union([
  z.string().uuid(),
  z.literal("schemavaults-registry"),
  z.literal("schemavaults-auth"),
  z.literal("schemavaults-mail"),
]);

export type ApiServerId = z.infer<typeof apiServerIdSchema>;
