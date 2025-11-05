import { z } from "zod";

export function isValidUuid(maybeUuid: unknown): maybeUuid is string {
  return z.string().uuid().safeParse(maybeUuid).success;
}

export default isValidUuid;
