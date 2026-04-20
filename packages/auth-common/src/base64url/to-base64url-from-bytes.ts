// Bytes → base64url (RFC 4648 §5) encoding. Works in both browser and
// Node contexts: prefers `btoa` when present (browsers, Bun, modern
// Node), otherwise falls back to `Buffer`. No `node:crypto` / `Buffer`
// import at module scope, so this file is safe to ship in browser
// bundles (Cypress webpack, etc.).

export function toBase64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default toBase64UrlFromBytes;
