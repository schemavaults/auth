import { importPKCS8, PEMFormat, sign_verify_alg } from "@schemavaults/jwt";

export default async function loadJwksAccessPrivateKey(
  env: object = process.env,
): Promise<CryptoKey> {
  if (
    typeof env === "object" &&
    "SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY" in env &&
    typeof env["SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY"] === "string" &&
    env["SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY"].length > 0
  ) {
    const environmentVariable: string =
      env["SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY"];

    let pem: PEMFormat;
    if (PEMFormat.isPemFormat(environmentVariable, "PRIVATE")) {
      try {
        pem = PEMFormat.parsePem(environmentVariable, "PRIVATE");
      } catch (e: unknown) {
        console.error(e);
        throw new TypeError(
          "Failed to import environment variable 'SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY' from PEM-encoded environment variable!",
        );
      }
    } else {
      try {
        pem = PEMFormat.fromBase64Url(environmentVariable, "PRIVATE");
      } catch (e: unknown) {
        console.error(e);
        throw new TypeError(
          "Failed to import environment variable 'SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY' from base64url-encoded environment variable!",
        );
      }
    }

    return await importPKCS8(pem.value, sign_verify_alg);
  } else {
    throw new TypeError(
      "Environment variable 'SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY' missing!",
    );
  }
}
