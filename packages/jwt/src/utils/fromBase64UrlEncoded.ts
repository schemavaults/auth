export function fromBase64UrlEncoded(base64url: string): string {
  return Buffer.from(base64url, "base64url").toString("utf8").trim();
}

export default fromBase64UrlEncoded;
