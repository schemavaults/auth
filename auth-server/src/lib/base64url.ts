
export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the type is
  // Uint8Array<ArrayBuffer> (what @simplewebauthn expects) rather than the
  // Uint8Array<ArrayBufferLike> a Node Buffer view carries.
  const buf = Buffer.from(value, "base64url");
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}
