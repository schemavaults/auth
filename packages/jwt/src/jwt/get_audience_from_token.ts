import { createAudienceSchema } from "@schemavaults/auth-common";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { decodeProtectedHeader } from "jose";
import { z } from "zod";

export default function getAudienceFromToken(
  token: string,
  environment?: SchemaVaultsAppEnvironment,
): string {
  const headers = decodeProtectedHeader(token);
  if ("aud" in headers) {
    if (typeof headers.aud === "string" && headers.aud.length > 0) {
      const aud: string = headers.aud;
      if (!createAudienceSchema(z, environment).safeParse(aud).success) {
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
