import isCryptoApiAvailable from "@/is_crypto_api_available";

export const digest_algorithm = "SHA-256" as const;

export async function sha256_digest(code_verifier: string): Promise<string> {
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

  // url_encode
  return output.replace(/[^A-Za-z0-9_-]/g, "_");
}

export default sha256_digest;
