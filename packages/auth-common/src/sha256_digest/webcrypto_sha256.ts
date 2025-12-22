export default async function webcrypto_sha256(
  code_verifier: string,
): Promise<string> {
  const hash: string = String.fromCharCode(
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(code_verifier),
      ),
    ),
  );
  return btoa(hash);
}
