import sha256Digest from "crypto-js/sha256";
import base64Stringify from "crypto-js/enc-base64";

export async function cryptojs_pkg_sha256(
  code_verifier: string,
): Promise<string> {
  const sha_digest: string = base64Stringify.stringify(
    sha256Digest(code_verifier),
  );
  if (typeof sha_digest !== "string") {
    throw new Error(
      "Expected final output of sha256 digest in insecure context to be a string",
    );
  }
  return sha_digest;
}

export default cryptojs_pkg_sha256;
