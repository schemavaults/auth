import "server-only";

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import { TOTP_ISSUER } from "./totp";

// Relying Party identity. WebAuthn binds a credential to an RP ID (a
// registrable domain) and an origin; both must match at registration and
// assertion time. We derive them from the auth server's own URL so that
// dev (localhost) and prod (auth.schemavaults.com) each verify against the
// right values. Optional env overrides exist for unusual deployments.

export function getRpId(): string {
  const override = process.env.PRIVATE_WEBAUTHN_RP_ID;
  if (typeof override === "string" && override.length > 0) return override;
  return new URL(getAuthServerUri()).hostname;
}

export function getExpectedOrigin(): string {
  return new URL(getAuthServerUri()).origin;
}

export function getRpName(): string {
  const override = process.env.PRIVATE_WEBAUTHN_RP_NAME;
  if (typeof override === "string" && override.length > 0) return override;
  // Reuse the same issuer string surfaced for TOTP ("SchemaVaults").
  return TOTP_ISSUER;
}

// base64url <-> bytes helpers. credential_id is already a base64url string
// from the browser; the COSE public key arrives as bytes and is stored
// base64url-encoded.
export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the type is
  // Uint8Array<ArrayBuffer> (what @simplewebauthn expects) rather than the
  // Uint8Array<ArrayBufferLike> a Node Buffer view carries.
  const buf = Buffer.from(value, "base64url");
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

function serializeTransports(
  transports: AuthenticatorTransportFuture[] | undefined,
): string | null {
  if (!transports || transports.length === 0) return null;
  return JSON.stringify(transports);
}

export function parseTransports(
  value: string | null,
): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (t): t is AuthenticatorTransportFuture => typeof t === "string",
      );
    }
  } catch {
    // ignore malformed transport metadata; it's advisory only
  }
  return undefined;
}

export interface ExistingCredentialDescriptor {
  credential_id: string;
  transports: string | null;
}

export async function generateWebauthnRegistrationOptions(args: {
  uid: string;
  userName: string;
  excludeCredentials: ExistingCredentialDescriptor[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    userName: args.userName,
    userID: new TextEncoder().encode(args.uid),
    attestationType: "none",
    excludeCredentials: args.excludeCredentials.map((c) => ({
      id: c.credential_id,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      // Second-factor passkey: don't force a discoverable (resident) key.
      residentKey: "discouraged",
      userVerification: "preferred",
    },
  });
}

export interface VerifiedWebauthnRegistration {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  aaguid: string | null;
  device_type: string | null;
  backed_up: boolean | null;
}

export async function verifyWebauthnRegistration(args: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}): Promise<VerifiedWebauthnRegistration | null> {
  const verification = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: getExpectedOrigin(),
    expectedRPID: getRpId(),
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return null;
  const { credential, aaguid, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  return {
    credential_id: credential.id,
    public_key: bytesToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: serializeTransports(credential.transports),
    aaguid: aaguid ?? null,
    device_type: credentialDeviceType ?? null,
    backed_up:
      typeof credentialBackedUp === "boolean" ? credentialBackedUp : null,
  };
}

export async function generateWebauthnAuthenticationOptions(args: {
  allowCredentials: ExistingCredentialDescriptor[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return await generateAuthenticationOptions({
    rpID: getRpId(),
    allowCredentials: args.allowCredentials.map((c) => ({
      id: c.credential_id,
      transports: parseTransports(c.transports),
    })),
    // Asserting as a second factor — the user already proved who they are
    // with a password, so don't require an extra user-verification gesture.
    userVerification: "discouraged",
  });
}

export interface StoredWebauthnCredential {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
}

export async function verifyWebauthnAuthentication(args: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: StoredWebauthnCredential;
}): Promise<{ verified: boolean; newCounter: number } | null> {
  const verification = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: getExpectedOrigin(),
    expectedRPID: getRpId(),
    requireUserVerification: false,
    credential: {
      id: args.credential.credential_id,
      publicKey: base64UrlToBytes(args.credential.public_key),
      counter: args.credential.counter,
      transports: parseTransports(args.credential.transports),
    },
  });
  return {
    verified: verification.verified,
    newCounter: verification.authenticationInfo.newCounter,
  };
}
