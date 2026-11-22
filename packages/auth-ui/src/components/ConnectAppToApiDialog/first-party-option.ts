import {
  isHardcodedApiServerId,
  isValidApiServerId,
} from "@schemavaults/app-definitions";

/**
 * Whether the connect dialog offers to mark the new connection first-party
 * for the API server id its field holds: only to platform administrators
 * (the server refuses anyone else), and never for a hardcoded API server
 * (they define no API scopes to consent to; the server refuses those too).
 *
 * The field holds whatever is typed so far, which `isHardcodedApiServerId()`
 * refuses (it throws) until it is a well-formed id: until then it names no
 * hardcoded API server. Client bundles resolve the auth server's own app id
 * to its default, so a white-label deployment's own API server id is only
 * refused by the server (400, shown in the dialog's error toast).
 */
export function canOfferFirstPartyConnection(
  admin: boolean,
  api_server_id: string,
): boolean {
  if (!admin) return false;
  const id: string = api_server_id.trim();
  return !(isValidApiServerId(id) && isHardcodedApiServerId(id));
}

export default canOfferFirstPartyConnection;
