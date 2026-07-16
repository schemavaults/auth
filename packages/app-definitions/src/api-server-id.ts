import { z } from "zod";
import createBaseIdSchema from "./base-id";

export {
  MINIMUM_ID_LENGTH as MINIMUM_API_SERVER_ID_LENGTH,
  MAXIMUM_ID_LENGTH as MAXIMUM_API_SERVER_ID_LENGTH,
} from "@/base-id";

export const apiServerIdSchema = createBaseIdSchema(z);

export type ApiServerId = z.infer<typeof apiServerIdSchema>;

export function isValidApiServerId(val: unknown): val is ApiServerId {
  return typeof val === "string" && apiServerIdSchema.safeParse(val).success;
}
