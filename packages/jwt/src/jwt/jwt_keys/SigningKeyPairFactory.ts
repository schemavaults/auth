import AbstractBaseKeyPairFactory from "./AbstractBaseKeyPairFactory";

export interface SigningKeyPairFactoryOptions {
  debug?: boolean;
}

/**
 * @name SigningKeyPairFactory
 * @see SigningKeyPairFactory.generate()
 * @description Generates a signing/verifier RSA256 key pair
 */
export class SigningKeyPairFactory extends AbstractBaseKeyPairFactory {

  private static async generateRsaPemSigningAndVerificationKeyPair(debug: boolean = false): Promise<
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

    if (debug) {
      console.log("[JWT_Keys] generateRsaPemSigningAndVerificationKeyPair() -> ", {
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
      console.log("[JWT_Keys] generateRsaPemSigningAndVerificationKeyPair() exported: -> ", {
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

    if (debug) {
      console.log("[JWT_Keys] generateRsaPemSigningAndVerificationKeyPair() pem format: -> ", {
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
    const [privateKey, publicKey] = await SigningKeyPairFactory.generateRsaPemSigningAndVerificationKeyPair(this.debug);

    return SigningKeyPairFactory.exportKeyPair([privateKey, publicKey], export_method);
  }
}

export default SigningKeyPairFactory;
