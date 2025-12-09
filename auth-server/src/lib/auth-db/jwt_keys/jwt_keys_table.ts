import {
  jsonSerializedJwtKeySchema,
  PEMFormat,
  type JsonSerializedJwtKey,
} from "@schemavaults/jwt";

import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export type JwtKeysTableShape = JsonSerializedJwtKey & {
  keyset_expiry: number;
};
export type JwtKeysTable = JwtKeysTableShape;

export const jwtKeyRecordSchema = jsonSerializedJwtKeySchema
  .refine((key_values) => {
    return (
      key_values.format === "pem" &&
      PEMFormat.isPemFormat(
        key_values.value,
        key_values.privacy_level === "private" ? "PRIVATE" : "PUBLIC",
      )
    );
  }, "Key format must be in valid PEM format for database storage")
  .refine(
    (
      key_values,
    ): key_values is JsonSerializedJwtKey & { keyset_expiry: number } => {
      return (
        typeof key_values.keyset_expiry === "number" &&
        !isNaN(key_values.keyset_expiry)
      );
    },
    "Keyset expiry must be a valid number",
  );

export function isValidJwtKeyRecord(
  record: unknown,
): record is JwtKeysTableShape {
  return jwtKeyRecordSchema.safeParse(record).success;
}

export type JwtKeyRecord = Selectable<JwtKeysTable>;
export type NewJwtKeyRecord = Insertable<JwtKeysTable>;
export type JwtKeyRecordUpdate = Updateable<JwtKeysTable>;
