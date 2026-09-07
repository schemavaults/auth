import { z } from "zod";

export default function isValidUuid(val: unknown): val is string {
  if (typeof val !== "string") return false;
  return z.guid().safeParse(val).success;
}
