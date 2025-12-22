export default function isCryptoApiAvailable(): boolean {
  let isCryptoAvailable: boolean = false;
  // Check if this is a server-side environment-- assume crypto is available then
  try {
    if (!window || typeof window === "undefined") {
      isCryptoAvailable = true;
    }
  } catch (e: unknown) {
    isCryptoAvailable = true;
  }

  // Check if the browser supports the Web Crypto API
  try {
    if (window && typeof window.crypto !== "undefined") {
      if (window.location.protocol === "https:") {
        isCryptoAvailable = true;
      }
      if (window.location.href.startsWith("https://")) {
        isCryptoAvailable = true;
      }
      if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(window.location.href)) {
        isCryptoAvailable = true;
      } else {
        isCryptoAvailable = false;
      }
    }
  } catch (e: unknown) {}

  return isCryptoAvailable;
}
