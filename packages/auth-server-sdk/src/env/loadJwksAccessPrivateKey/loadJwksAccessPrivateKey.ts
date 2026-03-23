// loadJwksAccessPrivateKey.ts

import {
  importPKCS8,
  isValidBase64UrlEncoding,
  PEMFormat,
  sign_verify_alg,
} from "@schemavaults/jwt";

export const JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME =
  "SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY" as const;

export default async function loadJwksAccessPrivateKey(
  env: object = process.env,
): Promise<CryptoKey> {
  const debug: boolean =
    "NODE_ENV" in env &&
    (env["NODE_ENV"] === "development" || env["NODE_ENV"] === "test");

  if (
    typeof env === "object" &&
    JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME in env &&
    typeof env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] === "string" &&
    env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME].length > 0
  ) {
    const environmentVariable: string =
      env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME];

    if (debug) {
      console.log(
        `[loadJwksAccessPrivateKey] Found env var with key '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}'!`,
      );
    }

    let pem: PEMFormat;
    if (PEMFormat.isPemFormat(environmentVariable, "PRIVATE", debug)) {
      try {
        pem = PEMFormat.parsePem(environmentVariable, "PRIVATE");
      } catch (e: unknown) {
        console.error(
          `Failed to import environment variable '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' from PEM-encoded environment variable: `,
          e,
        );
        throw new TypeError(
          `Failed to import environment variable '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' from PEM-encoded environment variable!`,
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
          `Failed to import environment variable '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' from base64url-encoded environment variable!`,
        );
      }
    } else {
      throw new TypeError(
        `Failed to determine what format the key in environment variable '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' is in!`,
      );
    }

    return await importPKCS8(pem.value, sign_verify_alg);
  } else {
    throw new TypeError(
      `Environment variable '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' missing!`,
    );
  }
}
