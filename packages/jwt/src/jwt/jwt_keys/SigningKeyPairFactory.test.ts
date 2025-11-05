import { test, describe, expect } from "bun:test";
import { SigningKeyPairFactory } from "./SigningKeyPairFactory";
import { base64url } from "jose";
import { PEMFormat } from "./pem-format";

describe("Signing Key Pair Factory", () => {
  test("can generate a public/private base64url-encoded key pair", async () => {
    const factory = new SigningKeyPairFactory({ debug: false });
    const [privateKey, publicKey] = await factory.generate("base64url");

    const pemPrivateKey = Buffer.from(base64url.decode(privateKey)).toString(
      "utf8",
    );
    expect(pemPrivateKey.startsWith("-----BEGIN PRIVATE KEY-----")).toBeTrue();
    expect(pemPrivateKey.endsWith("-----END PRIVATE KEY-----")).toBeTrue();

    const pemPublicKey = Buffer.from(base64url.decode(publicKey)).toString(
      "utf8",
    );
    expect(pemPublicKey.startsWith("-----BEGIN PUBLIC KEY-----")).toBeTrue();
    expect(pemPublicKey.endsWith("-----END PUBLIC KEY-----")).toBeTrue();
  });

  test("can generate a public/private PEM-encoded key pair", async () => {
    const factory = new SigningKeyPairFactory({ debug: false });
    const [privateKey, publicKey] = await factory.generate("pem");

    expect(privateKey.startsWith("-----BEGIN PRIVATE KEY-----")).toBeTrue();
    expect(privateKey.endsWith("-----END PRIVATE KEY-----")).toBeTrue();

    expect(publicKey.startsWith("-----BEGIN PUBLIC KEY-----")).toBeTrue();
    expect(publicKey.endsWith("-----END PUBLIC KEY-----")).toBeTrue();
  });

  test("PEMFormat.isPemFormat() thinks generated keys are valid", async () => {
    const factory = new SigningKeyPairFactory({ debug: false });
    const [privateKey, publicKey] = await factory.generate("pem");

    expect(PEMFormat.isPemFormat(privateKey, "PRIVATE")).toBeTrue();
    expect(PEMFormat.isPemFormat(publicKey, "PUBLIC")).toBeTrue();
  });
});
