import "server-only";

/**
 * Hash a high-entropy token (e.g. UUID) with a single SHA-256 pass.
 * No salt needed because the token itself has sufficient entropy.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data: BufferSource = encoder.encode(token);
  const hash: ArrayBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray: Uint8Array = new Uint8Array(hash);
  const hashHex: string = Array.prototype.map
    .call(hashArray, (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
  return hashHex;
}

export default hashToken;
