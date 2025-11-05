export function toBase64UrlEncoded(utf8: string): string {
  return Buffer.from(utf8, "utf8").toString("base64url").trim();
}

export default toBase64UrlEncoded;
