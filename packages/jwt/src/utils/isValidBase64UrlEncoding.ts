export function isValidBase64UrlEncoding(str: string): boolean {
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;

  if (!str || str.length === 0) {
    return false;
  }

  if (!base64UrlRegex.test(str)) {
    return false;
  }
  return str.length >= 1;
}

export default isValidBase64UrlEncoding;
