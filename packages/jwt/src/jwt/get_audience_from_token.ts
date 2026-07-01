import { audienceSchema } from "@schemavaults/auth-common";
import { decodeProtectedHeader } from "jose";

export default function getAudienceFromToken(token: string): string {
  const headers = decodeProtectedHeader(token);
  if ("aud" in headers) {
    if (typeof headers.aud === "string" && headers.aud.length > 0) {
      const aud: string = headers.aud;
      if (!audienceSchema.safeParse(aud).success) {
        throw new Error(
          "Invalid token; 'aud' claim must be a valid token audience",
        );
      }
      return aud;
    }
    throw new Error("Invalid token; 'aud' claim must be a string");
  }
  throw new Error("Invalid token; no 'aud' claim in header");
}
