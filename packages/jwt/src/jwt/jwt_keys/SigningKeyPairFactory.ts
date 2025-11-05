import { base64url } from "jose";
import { PEMFormat } from "./pem-format";

export interface SigningKeyPairFactoryOptions {
  debug?: boolean;
}

/**
 * @name SigningKeyPairFactory
 * @see SigningKeyPairFactory.generate()
 * @description Generates a signing/verifier RSA256 key pair
 */
export class SigningKeyPairFactory {
  private debug: boolean;

  public constructor({ debug }: SigningKeyPairFactoryOptions) {
    this.debug = typeof debug === "boolean" ? debug : false;
  }

  private static toPemFormat(key: ArrayBuffer, key_type: "PUBLIC" | "PRIVATE") {
    return PEMFormat.toPemFormat(key, key_type);
  }

  private async generateRsaPemKeyPair(): Promise<
    readonly [privateKey: string, publicKey: string]
  > {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );

    if (this.debug) {
      console.log("[JWT_Keys] generateSigningKeyPair() -> ", {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      });
    }

    const exportedPrivateKey: ArrayBuffer = await crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey,
    );
    const exportedPublicKey: ArrayBuffer = await crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey,
    );

    if (this.debug) {
      console.log("[JWT_Keys] generateSigningKeyPair() exported: -> ", {
        exportedPublicKey,
        exportedPrivateKey,
      });
    }

    const pemPrivateKey: string = SigningKeyPairFactory.toPemFormat(
      exportedPrivateKey,
      "PRIVATE",
    );
    const pemPublicKey: string = SigningKeyPairFactory.toPemFormat(
      exportedPublicKey,
      "PUBLIC",
    );

    if (this.debug) {
      console.log("[JWT_Keys] generateSigningKeyPair() pem format: -> ", {
        pemPublicKey,
        pemPrivateKey,
      });
    }

    return [pemPrivateKey, pemPublicKey] as const satisfies readonly [
      string,
      string,
    ];
  }

  // Generate base64url-encoded [private, public] RSA key pair
  public async generate(
    export_method: "base64url" | "pem",
  ): Promise<readonly [privateKey: string, publicKey: string]> {
    const [privateKey, publicKey] = await this.generateRsaPemKeyPair();

    switch (export_method) {
      case "pem":
        return [privateKey, publicKey] as const satisfies readonly [
          string,
          string,
        ];
      case "base64url":
        return [
          base64url.encode(privateKey),
          base64url.encode(publicKey),
        ] as const satisfies readonly [string, string];
      default:
        throw new Error(
          "Received invalid 'export_method' to generate key pair with!",
        );
    }
  }
}
