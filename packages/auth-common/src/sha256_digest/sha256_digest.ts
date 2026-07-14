import isCryptoApiAvailable from "@/is_crypto_api_available";

export const digest_algorithm = "SHA-256" as const;

/**
 * Computes the SHA-256 digest of the input and returns it as a
 * standard base64 string (RFC 4648 §4, with `+`, `/`, and `=` padding).
 * Picks the WebCrypto implementation in secure contexts and falls back
 * to crypto-js in insecure HTTP contexts (both return standard base64).
 */
async function sha256_standard_base64(code_verifier: string): Promise<string> {
  let sha256: (code_verifier: string) => Promise<string>;
  try {
    if (isCryptoApiAvailable()) {
      sha256 = await import("./webcrypto_sha256").then((mod) => mod.default);
    } else {
      sha256 = await import("./cryptojs_pkg_sha256").then((mod) => mod.default);
    }
  } catch (e: unknown) {
    console.error("Failed to load sha256 hash function: ", e);
    throw new Error("Failed to load sha256 hash function");
  }

  if (typeof sha256 !== "function" && typeof sha256 !== "object") {
    throw new Error(
      "Failed to import sha256 library to use inplace of crypto.subtle.digest in insecure HTTP context",
    );
  }

  const output: string = await sha256(code_verifier);

  if (typeof output !== "string") {
    throw new TypeError("Expected output to be a string!");
  }

  return output;
}

/**
 * Strict RFC 7636 §4.2 / RFC 4648 §5 base64url (no padding) encoding of
 * the SHA-256 digest — the `code_challenge` encoding used by both the
 * SchemaVaults SDK and standard OAuth2/OIDC clients. Produces a 43-char
 * string.
 */
export async function sha256_base64url(code_verifier: string): Promise<string> {
  const output: string = await sha256_standard_base64(code_verifier);
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default sha256_base64url;
