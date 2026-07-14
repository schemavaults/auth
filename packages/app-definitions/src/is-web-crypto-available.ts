import { isBrowserRuntime } from "./is-browser-runtime";

export function isWebCryptoAvailable(): boolean {
  let hasWebCrypto: boolean = false;
  try {
    if (
      typeof crypto === "object" &&
      !!crypto &&
      typeof crypto.getRandomValues === "function" &&
      typeof crypto.randomUUID === "function"
    ) {
      hasWebCrypto = true;
    }
  } catch {
    hasWebCrypto = false;
  }

  if (isBrowserRuntime()) {
    let isSecureContext: boolean = false;
    // @ts-expect-error We're checking if the 'window' global has 'isSecureContext' flag when DOM library is not explicitly loaded
    if (typeof window.isSecureContext === "boolean") {
      // @ts-expect-error We're checking if the 'window' global has 'isSecureContext' flag when DOM library is not explicitly loaded
      isSecureContext = window.isSecureContext;
    }

    if (isSecureContext) {
      return hasWebCrypto;
    } else {
      return false;
    }
  } else {
    // non-browser runtime
    return hasWebCrypto;
  }
}

export default isWebCryptoAvailable;
