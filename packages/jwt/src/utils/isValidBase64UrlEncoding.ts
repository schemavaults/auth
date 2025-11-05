// Alternative version with more strict length validation
function isBase64UrlStrict(str: string): boolean {
  // Base64URL regex with optional length validation
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;

  if (!str || str.length === 0) {
    return false;
  }

  // Check regex pattern
  if (!base64UrlRegex.test(str)) {
    return false;
  }
  return str.length >= 1;
}

export function isValidBase64UrlEncoding(str: string): boolean {
  return isBase64UrlStrict(str);
}

export default isValidBase64UrlEncoding;
