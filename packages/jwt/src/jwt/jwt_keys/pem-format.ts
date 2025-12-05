/**
 * @name PEMFormat
 * @class
 * @hideconstructor
 * @see PEMFormat.toPemFormat()
 * @see PEMFormat.isPemFormat()
 */
export class PEMFormat {
  private constructor() {}

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
  ): boolean {
    if (key_type !== "PUBLIC" && key_type !== "PRIVATE") {
      throw new Error("Expected 'key_type' to be 'PUBLIC' or 'PRIVATE'");
    }

    const prefix = PEMFormat.getPemPrefix(key_type);
    const suffix = PEMFormat.getPemSuffix(key_type);
    if (!key.startsWith(prefix)) {
      console.error("[isPemFormat] key does not start with prefix: ", prefix);
      return false;
    } else if (!key.endsWith(suffix)) {
      console.error("[isPemFormat] key does not end with suffix: ", suffix);
      return false;
    }

    const allLinesLessThan64Chars = key
      .split("\n")
      .every((line): boolean => line.length <= 64);
    if (!allLinesLessThan64Chars) {
      console.error("[isPemFormat] key has line length longer than 64!");
      return false;
    }

    return true;
  }
}

export default PEMFormat;
