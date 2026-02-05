import isValidBase64UrlEncoding from "@/utils/isValidBase64UrlEncoding";
import { base64url } from "jose";

/**
 * @name PEMFormat
 * @class
 * @hideconstructor
 * @see PEMFormat.toPemFormat()
 * @see PEMFormat.isPemFormat()
 */
export class PEMFormat {
  private readonly _pem: string;
  private readonly _key_type: "PUBLIC" | "PRIVATE";

  private constructor(pem: string, key_type: "PUBLIC" | "PRIVATE") {
    if (typeof pem !== "string") {
      throw new TypeError("Expected 'pem' key to be a string!");
    }
    if (key_type !== "PUBLIC" && key_type !== "PRIVATE") {
      throw new TypeError("Expected 'key_type' to be 'PUBLIC' or 'PRIVATE'");
    }
    if (!PEMFormat.isPemFormat(pem, key_type)) {
      throw new TypeError("Key does not appear to be in valid PEM format!");
    }
    this._pem = pem;
    this._key_type = key_type;
  }

  private static arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
    let byteArray: Uint8Array = new Uint8Array(arrayBuffer);
    let byteString: string = "";
    for (var i = 0; i < byteArray.byteLength; i++) {
      byteString += String.fromCharCode(byteArray[i]);
    }
    return btoa(byteString);
  }

  private static addNewLines(base64str: string): string {
    let finalString: string = "";
    let remainingString: string = base64str;
    while (remainingString.length > 0) {
      finalString += `${remainingString.substring(0, 64)}\n`;
      remainingString = remainingString.substring(64);
    }

    return finalString;
  }

  private static getPemPrefix(key_type: "PUBLIC" | "PRIVATE") {
    return `-----BEGIN ${key_type} KEY-----` as const satisfies string;
  }

  private static getPemSuffix(key_type: "PUBLIC" | "PRIVATE") {
    return `-----END ${key_type} KEY-----` as const satisfies string;
  }

  public static toPemFormat(key: ArrayBuffer, key_type: "PUBLIC" | "PRIVATE") {
    if (key_type !== "PUBLIC" && key_type !== "PRIVATE") {
      throw new Error("Expected 'key_type' to be 'PUBLIC' or 'PRIVATE'");
    }

    const raw_base64_key: string = PEMFormat.arrayBufferToBase64(key);
    const with_newlines: string = PEMFormat.addNewLines(raw_base64_key);

    const pem: string =
      `${PEMFormat.getPemPrefix(key_type)}\n` +
      with_newlines +
      `${PEMFormat.getPemSuffix(key_type)}`;

    return pem;
  }

  public static isPemFormat(
    key: string,
    key_type: "PUBLIC" | "PRIVATE",
    debug: boolean = false,
  ): boolean {
    if (key_type !== "PUBLIC" && key_type !== "PRIVATE") {
      throw new Error("Expected 'key_type' to be 'PUBLIC' or 'PRIVATE'");
    }

    const prefix = PEMFormat.getPemPrefix(key_type);
    const suffix = PEMFormat.getPemSuffix(key_type);
    if (!key.startsWith(prefix)) {
      if (debug) {
        console.warn("[isPemFormat] key does not start with prefix: ", prefix);
      }
      return false;
    } else if (!key.endsWith(suffix)) {
      if (debug) {
        console.warn("[isPemFormat] key does not end with suffix: ", suffix);
      }
      return false;
    }

    const allLinesLessThan64Chars = key
      .split("\n")
      .every((line): boolean => line.length <= 64);
    if (!allLinesLessThan64Chars) {
      if (debug) {
        console.warn("[isPemFormat] key has line length longer than 64!");
      }
      return false;
    }

    return true;
  }

  public static parsePem(
    pem: string,
    key_type: "PUBLIC" | "PRIVATE",
  ): PEMFormat {
    if (key_type !== "PUBLIC" && key_type !== "PRIVATE") {
      throw new TypeError("Expected 'key_type' to be 'PUBLIC' or 'PRIVATE'");
    }

    return new PEMFormat(pem, key_type);
  }

  public get value(): string {
    return this._pem;
  }

  public get key_type(): "PUBLIC" | "PRIVATE" {
    return this._key_type;
  }

  public toBase64Url(): string {
    return base64url.encode(this._pem);
  }

  public static fromBase64Url(
    base64url_encoded_pem_key: string,
    key_type: "PUBLIC" | "PRIVATE",
    debug: boolean = false,
  ) {
    if (typeof base64url_encoded_pem_key !== "string") {
      throw new TypeError(
        "Expected 'base64url_encoded_pem_key' key to be a string!",
      );
    } else if (!isValidBase64UrlEncoding(base64url_encoded_pem_key)) {
      throw new TypeError(
        "'base64url_encoded_pem_key' does not appear to be base64url-encoded!",
      );
    }
    if (key_type !== "PUBLIC" && key_type !== "PRIVATE") {
      throw new TypeError("Expected 'key_type' to be 'PUBLIC' or 'PRIVATE'");
    }
    const decoded: string = base64url
      .decode(base64url_encoded_pem_key)
      .toString();
    if (typeof decoded !== "string") {
      throw new TypeError("Expected 'decoded' key to be a string!");
    }
    if (debug) {
      console.log(
        `[PEMFormat::fromBase64Url] Decoded base64url string: `,
        decoded,
      );
    }

    return new PEMFormat(decoded, key_type);
  }
}

export default PEMFormat;
