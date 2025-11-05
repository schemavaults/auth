
export const digest_algorithm = 'SHA-256' as const;

export async function sha256_digest(code_verifier: string): Promise<string> {
  let digest: ((code_verifier: string) => Promise<string>) | undefined = undefined;

  // Load sha-256 digest function
  const isSecureContext: boolean = !!crypto && !!crypto.subtle;
  if (isSecureContext) {
    digest = async function secureContextSha256Digest(code_verifier: string): Promise<string> {
      const encoder = new TextEncoder();
      const data: Uint8Array = encoder.encode(code_verifier);

      const sha_digest = await crypto.subtle.digest(digest_algorithm, data);

      const hash_buffer: Buffer = Buffer.from(sha_digest);
      const base64_encoded_hash: string = hash_buffer.toString('base64');

      if (typeof base64_encoded_hash !== 'string') {
        throw new Error("Failed to base64 encode sha256 digest!");
      }

      const base64url_encoded_hash = base64_encoded_hash.replace(/[^A-Za-z0-9_-]/g, '_');

      return base64url_encoded_hash
    }
  } else {
    digest = async function insecureContextSha256Digest(code_verifier: string): Promise<string> {
      let sha256: (code_verifier: string) => Promise<string>;
      try {
        const sha256Digest = await import('crypto-js/sha256').then(mod => mod.default);
        const base64Stringify = await import('crypto-js/enc-base64').then(mod => mod.default);
        sha256 = async (code_verifier: string): Promise<string> => {
          const sha_digest = sha256Digest(code_verifier);
          const output = base64Stringify.stringify(sha_digest)
          if (typeof output !== 'string') {
            throw new Error("Expected final output of sha256 digest in insecure context to be a string");
          }
          return output;
        }
      } catch (e: unknown) {
        throw new Error("Failed to load sha256 hash function")
      }

      if (typeof sha256 !== 'function' && typeof sha256 !== 'object') {
        throw new Error("Failed to import sha256 library to use inplace of crypto.subtle.digest in insecure HTTP context")
      }

      const output = await sha256(code_verifier) satisfies string;

      if (typeof output !== 'string') {
        throw new Error("Expected output to be a string!");
      }

      // url_encode
      return output.replace(/[^A-Za-z0-9_-]/g, '_');;
    }
  }

  if (typeof digest === 'undefined') {
    throw new Error("Failed to load SHA-256 digest function")
  }

  const base64url_encoded_hash = await digest(code_verifier);

  return base64url_encoded_hash;
}
