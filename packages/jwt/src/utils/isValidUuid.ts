import { z } from "zod";export const isValidUuid = (value: unknown): value is string => z.guid().safeParse(value).success;
export default isValidUuid;
