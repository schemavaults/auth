import { z } from "zod";
import createBaseIdSchema from "./base-id";

export const apiServerIdSchema = createBaseIdSchema(z);

export type ApiServerId = z.infer<typeof apiServerIdSchema>;

export function isValidApiServerId(val: unknown): val is ApiServerId {
  return typeof val === "string" && apiServerIdSchema.safeParse(val).success;
}
