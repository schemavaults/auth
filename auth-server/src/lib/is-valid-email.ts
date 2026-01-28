import { z } from "zod";

export default function isValidEmail(val: unknown): val is string {
  if (typeof val !== 'string') {
    return false;
  }
  return z.string().email().safeParse(val).success;
}
