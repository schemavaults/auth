import isValidUuid from "@/utils/isValidUuid";
import { decodeProtectedHeader, ProtectedHeaderParameters } from "jose";

export function getKeysetIdFromToken(token: string): string {
  const header: ProtectedHeaderParameters = decodeProtectedHeader(token);
  if (!header.kid || !header.keyset_id) {
    throw new Error("Invalid token; missing 'kid' or 'keyset_id' in header!");
  }
  if (!isValidUuid(header.keyset_id)) {
    throw new Error("Invalid token; 'keyset_id' is not a valid UUID!");
  }
  if (!header.kid.startsWith(header.keyset_id)) {
    throw new Error("Invalid token; 'kid' does not start with 'keyset_id'!");
  }
  return header.keyset_id;
}

export default getKeysetIdFromToken;
