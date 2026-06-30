import { type z as zod } from "zod";

export const MINIMUM_ID_LENGTH = 2 as const;
export const MAXIMUM_ID_LENGTH = 64 as const;

/**
 *
 * @param z Zod namespace
 * @returns A schema that validates a basic standard for IDs.
 * @augments zod.string
 */
export function createBaseIdSchema(z: typeof zod) {
  return z
    .string()
    .regex(
      /^[a-z0-9_-]*$/,
      "ID may only contain lowercase alphanumeric, hyphens, and underscores.",
    )
    .min(
      MINIMUM_ID_LENGTH,
      `ID must be at least ${MINIMUM_ID_LENGTH} characters long.`,
    )
    .max(
      MAXIMUM_ID_LENGTH,
      `ID may not exceed ${MAXIMUM_ID_LENGTH} characters long.`,
    )
    .refine(function mustStartWithLowercaseAlphabetical(
      baseId: string,
    ): boolean {
      const lowercaseAlphabeticalRegex = new RegExp(/^[a-z0-9]$/);
      const isLowercaseAlphabetical: boolean = lowercaseAlphabeticalRegex.test(
        baseId[0],
      );
      return isLowercaseAlphabetical;
    }, "ID must start with lowercase alphanumeric character")
    .refine(function mustNotEndWithUnderscoreOrHyphen(baseId: string): boolean {
      if (baseId.endsWith("-") || baseId.endsWith("_")) {
        return false;
      }
      return true;
    }, "ID may not end with an underscore or hyphen.");
}

export default createBaseIdSchema;
