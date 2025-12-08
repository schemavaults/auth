// JsonSerializedJwtKey.ts

import { z } from "zod";
import { validJwtKeyTypesList } from "./ValidJwtKeyTypes";

export const jsonSerializedJwtKeySchema = z.object({
  keyset_id: z.string().uuid(),
  keyset_expiry: z.number().nonnegative().optional(),
  value: z.string().min(1),
  format: z.enum(["pem", "base64url"]),
  privacy_level: z.enum(["private", "public"]),
  key_type: z.enum(validJwtKeyTypesList)
}).required({
  keyset_id: true,
  value: true,
  format: true,
  privacy_level: true,
  key_type: true
}).strict()

export type JsonSerializedJwtKey = z.infer<typeof jsonSerializedJwtKeySchema>;
