import AbstractBaseKeyPairFactory from "./AbstractBaseKeyPairFactory";

export interface ContentEncryptionKeyPairFactoryOptions {
  debug?: boolean;
}

/**
 * @name ContentEncryptionKeyPairFactory
 * @see ContentEncyptionKeyPairFactory.generate()
 * @description Generates an encryption/decryption key pair
 */
export class ContentEncryptionKeyPairFactory extends AbstractBaseKeyPairFactory {
  private static async generateRsaPemEncryptionAndDecryptionKeyPair(debug: boolean = false): Promise<
    readonly [privateKey: string, publicKey: string]
  > {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );

    if (debug) {
      console.log("[JWT_Keys] generateRsaPemEncryptionAndDecryptionKeyPair() -> ", {
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

    if (debug) {
      console.log("[JWT_Keys] generateRsaPemEncryptionAndDecryptionKeyPair() exported: -> ", {
        exportedPublicKey,
        exportedPrivateKey,
      });
    }

    const pemPrivateKey: string = ContentEncryptionKeyPairFactory.toPemFormat(
      exportedPrivateKey,
      "PRIVATE",
    );
    const pemPublicKey: string = ContentEncryptionKeyPairFactory.toPemFormat(
      exportedPublicKey,
      "PUBLIC",
    );

    if (debug) {
      console.log("[JWT_Keys] generateRsaPemEncryptionAndDecryptionKeyPair() pem format: -> ", {
        pemPublicKey,
        pemPrivateKey,
      });
    }

    return [pemPrivateKey, pemPublicKey] as const satisfies readonly [
      string,
      string,
    ];
  }

  public async generate(export_method: "base64url" | "pem"): Promise<readonly [privateKey: string, publicKey: string]> {
    const [privateKey, publicKey] = await ContentEncryptionKeyPairFactory.generateRsaPemEncryptionAndDecryptionKeyPair(this.debug);

    return ContentEncryptionKeyPairFactory.exportKeyPair([privateKey, publicKey], export_method)
  }
}
