import PEMFormat from "./pem-format";

export interface BaseKeyPairFactoryOptions {
  debug?: boolean;
}

export abstract class AbstractBaseKeyPairFactory {
  protected readonly debug: boolean;

  public constructor(options: BaseKeyPairFactoryOptions = {}) {
    this.debug = options.debug || false;
  }

  protected static toPemFormat(
    key: ArrayBuffer,
    key_type: "PUBLIC" | "PRIVATE",
  ) {
    return PEMFormat.toPemFormat(key, key_type);
  }

  protected static exportKeyPair(
    [privateKey, publicKey]: readonly [privateKey: string, publicKey: string],
    export_method: "pem" | "base64url",
  ) {
    switch (export_method) {
      case "pem":
        return [privateKey, publicKey] as const satisfies readonly [
          string,
          string,
        ];
      case "base64url":
        return [
          PEMFormat.parsePem(privateKey, "PRIVATE").toBase64Url(),
          PEMFormat.parsePem(publicKey, "PUBLIC").toBase64Url(),
        ] as const satisfies readonly [string, string];
      default:
        throw new Error(
          "Received invalid 'export_method' to generate key pair with!",
        );
    }
  }

  public abstract generate(
    export_method: "pem" | "base64url",
  ): Promise<readonly [privateKey: string, publicKey: string]>;
}

export default AbstractBaseKeyPairFactory;
