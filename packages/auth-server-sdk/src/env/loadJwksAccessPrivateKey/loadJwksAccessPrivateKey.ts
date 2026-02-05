import {
  importPKCS8,
  isValidBase64UrlEncoding,
  PEMFormat,
  sign_verify_alg,
} from "@schemavaults/jwt";

const key = "SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY" as const;

export default async function loadJwksAccessPrivateKey(
  env: object = process.env,
): Promise<CryptoKey> {
  const debug: boolean =
    "NODE_ENV" in env &&
    (env["NODE_ENV"] === "development" || env["NODE_ENV"] === "test");

  if (
    typeof env === "object" &&
    key in env &&
    typeof env[key] === "string" &&
    env[key].length > 0
  ) {
    const environmentVariable: string = env[key];

    if (debug) {
      console.log(
        `[loadJwksAccessPrivateKey] Found env var with key '${key}'!`,
      );
    }

    let pem: PEMFormat;
    if (PEMFormat.isPemFormat(environmentVariable, "PRIVATE", debug)) {
      try {
        pem = PEMFormat.parsePem(environmentVariable, "PRIVATE");
      } catch (e: unknown) {
        console.error(
          `Failed to import environment variable '${key}' from PEM-encoded environment variable: `,
          e,
        );
        throw new TypeError(
          `Failed to import environment variable '${key}' from PEM-encoded environment variable!`,
        );
      }
    } else if (isValidBase64UrlEncoding(environmentVariable)) {
      try {
        pem = PEMFormat.fromBase64Url(environmentVariable, "PRIVATE", debug);
      } catch (e: unknown) {
        console.error(
          `Failed to convert base64url-formatted private key into PEM-format: `,
          e,
        );
        throw new TypeError(
          `Failed to import environment variable '${key}' from base64url-encoded environment variable!`,
        );
      }
    } else {
      throw new TypeError(
        `Failed to determine what format the key in environment variable '${key}' is in!`,
      );
    }

    return await importPKCS8(pem.value, sign_verify_alg);
  } else {
    throw new TypeError(`Environment variable '${key}' missing!`);
  }
}
