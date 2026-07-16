import { z } from "zod";
import createBaseIdSchema from "./base-id";

export {
  MINIMUM_ID_LENGTH as MINIMUM_APP_ID_LENGTH,
  MAXIMUM_ID_LENGTH as MAXIMUM_APP_ID_LENGTH,
} from "@/base-id";

export const appIdSchema = createBaseIdSchema(z);

export type AppId = z.infer<typeof appIdSchema>;

export function isValidAppId(val: unknown): val is AppId {
  return typeof val === "string" && appIdSchema.safeParse(val).success;
}
