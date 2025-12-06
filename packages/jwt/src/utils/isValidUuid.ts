import { z } from "zod";export const isValidUuid = (value: unknown): value is string => z.string().uuid().safeParse(value).success;
export default isValidUuid;
