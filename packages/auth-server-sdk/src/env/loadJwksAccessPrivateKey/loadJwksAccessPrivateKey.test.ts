import { describe, expect, test } from "bun:test";
import loadJwksAccessPrivateKey from "./loadJwksAccessPrivateKey";
import { SigningKeyPairFactory } from "@schemavaults/jwt";

const DEBUG: boolean = true;

describe("loadJwksAccessPrivateKey", () => {
  test("can load crypto key from base64url-encoded environment variable", async () => {
    const [privateKey, _publicKey] = await new SigningKeyPairFactory().generate(
      "base64url",
    );
    void _publicKey;

    let errorThrown: boolean = false;
    try {
      const crypto_key = await loadJwksAccessPrivateKey({
        SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY: privateKey,
        NODE_ENV: process.env.NODE_ENV,
      });
      if (!(crypto_key instanceof CryptoKey)) {
        throw new Error("Result is not an instance of crypto key!");
      }
    } catch (e: unknown) {
      if (DEBUG) {
        console.error(e);
      }
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("can load crypto key from PEM-format environment variable", async () => {
    const [privateKey, _publicKey] = await new SigningKeyPairFactory().generate(
      "pem",
    );
    void _publicKey;

    let errorThrown: boolean = false;
    try {
      const crypto_key = await loadJwksAccessPrivateKey({
        SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY: privateKey,
        NODE_ENV: process.env.NODE_ENV,
      });
      if (!(crypto_key instanceof CryptoKey)) {
        throw new Error("Result is not an instance of crypto key!");
      }
    } catch (e: unknown) {
      if (DEBUG) {
        console.error(e);
      }
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("an error is thrown when not passing a random string instead of a real key", async () => {
    let errorThrown: boolean = false;
    try {
      const crypto_key = await loadJwksAccessPrivateKey({
        SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY:
          "blahblahblahblahblahblahblahblah",
        NODE_ENV: process.env.NODE_ENV,
      });
      if (!(crypto_key instanceof CryptoKey)) {
        throw new Error("Result is not an instance of crypto key!");
      }
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(errorThrown).toBeTrue();
  });
});
