interface Base_Initialize_JWT_Keys_Options {
  debug?: boolean;
  // base64url-encoded JWT CEK
  encryption_secret?: string;
  // base64url-encoded JWT CEK
  decryption_secret?: string;
}

export interface Initialize_JWT_Keys_Options
  extends Base_Initialize_JWT_Keys_Options {
  // PKCS8 RS256 formatted signing key
  private_signing_secret?: string;
  // SPKI RS256 formatted public verifier key
  public_signing_verifier?: string;
}

export interface Initialize_JWT_Keys_Options_Base64UrlEncoded
  extends Base_Initialize_JWT_Keys_Options {
  // base64url-encoded PKCS8 RS256 formatted signing key
  private_signing_secret_base64url?: string;
  // base64url-encoded SPKI RS256 formatted public verifier key
  public_signing_verifier_base64url?: string;
}
