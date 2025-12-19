// JsonSerializedJwtKey.ts

import { z } from "zod";
import { validJwtKeyTypesList } from "./ValidJwtKeyTypes";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import PEMFormat from "./pem-format";

export const jsonSerializedJwtKeySchema = z
  .object({
    audience_id: apiServerIdSchema,
    keyset_id: z.string().uuid(),
    keyset_expiry: z.number().nonnegative().optional(),
    value: z.string().min(1),
    format: z.enum(["pem", "base64url"]),
    privacy_level: z.enum(["private", "public"]),
    key_type: z.enum(validJwtKeyTypesList),
  })
  .required({
    audience_id: true,
    keyset_id: true,
    value: true,
    format: true,
    privacy_level: true,
    key_type: true,
  })
  .strict()
  .refine((key): boolean => {
    if (
      key.format === "pem" &&
      key.privacy_level === "public" &&
      !PEMFormat.isPemFormat(key.value, "PUBLIC")
    ) {
      return false;
    }

    if (
      key.format === "pem" &&
      key.privacy_level === "private" &&
      !PEMFormat.isPemFormat(key.value, "PRIVATE")
    ) {
      return false;
    }

    return true;
  }, "Mismatch between 'privacy_level' and header of PEM-formatted key");

export type JsonSerializedJwtKey = z.infer<typeof jsonSerializedJwtKeySchema>;
