import z from "zod";

const urlSchema = z.string().url();

export function isValidUrl(val: unknown): val is string {
  return typeof val === 'string' && urlSchema.safeParse(val).success
}

export default isValidUrl;
