export default function isCryptoApiAvailable(): boolean {
  // Check if this is a server-side environment-- assume crypto is available then
  try {
    if (!window || typeof window === "undefined") {
      return true;
    }
  } catch (e: unknown) {
    void e; // an error means 'window' is not defined and threw-- this is a server
    return true;
  }

  // Check if the browser supports the Web Crypto API
  try {
    if (window && typeof window.crypto !== "undefined") {
      if (window.location.protocol === "https:") {
        return true;
      }
      if (window.location.href.startsWith("https://")) {
        return true;
      }
      if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(window.location.href)) {
        return true;
      }
    }
  } catch (e: unknown) {
    void e;
  }

  return false;
}
