import { z } from "zod";

export const DEFAULT_PAGINATION_PAGE_SIZE = 50 as const;
export const DEFAULT_PAGINATION_PAGE_INDEX = 0 as const;

export const paginationOptionsSchema = z
  .object({
    page_index: z
      .number()
      .nonnegative()
      .int()
      .default(DEFAULT_PAGINATION_PAGE_INDEX)
      .optional(),
    page_size: z
      .number()
      .positive()
      .int()
      .default(DEFAULT_PAGINATION_PAGE_SIZE)
      .optional(),
  })
  .strict();

export type PaginationOptions = z.infer<typeof paginationOptionsSchema>;

export function isValidPaginationOptions(
  val: unknown,
): val is PaginationOptions {
  return paginationOptionsSchema.safeParse(val).success;
}
