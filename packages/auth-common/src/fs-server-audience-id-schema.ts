import { z } from "zod";
import {
  type StorageRegionID,
  baseStorageRegionIdSchema,
} from "@schemavaults/storage-regions";

export { type StorageRegionID, baseStorageRegionIdSchema };

export const fsServerAudienceIdSchema = z
  .string()
  .refine((str: string): str is `schemavaults-fs:${string}` => {
    return str.startsWith("schemavaults-fs:");
  }, "Invalid FS server audience prefix")
  .refine(
    (
      fs_audience_str,
    ): fs_audience_str is `schemavaults-fs:${StorageRegionID}` => {
      const parts = fs_audience_str.split(":");
      if (parts.length !== 2) {
        return false;
      }
      const region_id: string = parts[1];
      if (typeof region_id !== "string") {
        return false;
      }

      const parsed_region_id = baseStorageRegionIdSchema.safeParse(region_id);
      if (!parsed_region_id.success) {
        console.error(
          "Invalid region ID following 'schemavaults-fs:' prefix:",
          parsed_region_id.error,
        );
        return false;
      }

      try {
        if (process.env.NODE_ENV === "development") {
          console.log(
            "[fsServerAudienceIdSchema] Region ID has been determined to be semantically valid... (but may still not reference a real storage region!",
          );
        }
      } catch (e: unknown) {
        /** no-op */
      }

      return true;
    },
    "Invalid region ID following 'schemavaults-fs:' prefix",
  );
