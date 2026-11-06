// NOT server-only: pure WebCrypto (unit tested). Only the server calls it.

/**
 * Sealed cookies: a value encrypted and authenticated with AES-256-GCM under
 * a key derived (HKDF-SHA-256) from a server secret, so the browser can hold
 * the agents app's sign-in without reading or altering it, and any server
 * instance can open it (nothing is kept in server memory). A sealed value
 * longer than one cookie can hold is split across numbered cookies
 * (`name.0`, `name.1`, ...).
 */

const VERSION = "v1";
const IV_BYTES = 12;
/** Characters per cookie chunk: well under the ~4 KB a browser keeps per cookie. */
export const SEALED_COOKIE_CHUNK_SIZE = 3800;
/** Chunks read and cleared at most (a sign-in seals to two). */
const MAX_CHUNKS = 6;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sealingKey(secret: string, purpose: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("@schemavaults/example-nextjs-resource-server sealed cookie"),
      info: encoder.encode(purpose),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts `value` (JSON) for `purpose` (which also binds it: other purposes cannot open it). */
export async function sealValue(secret: string, purpose: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await sealingKey(secret, purpose),
      encoder.encode(JSON.stringify(value)),
    ),
  );
  const sealed = new Uint8Array(iv.length + ciphertext.length);
  sealed.set(iv);
  sealed.set(ciphertext, iv.length);
  return `${VERSION}.${toBase64Url(sealed)}`;
}

/** The value `sealValue()` sealed, or null when it was altered, sealed for another purpose or key, or malformed. */
export async function unsealValue(secret: string, purpose: string, sealed: string): Promise<unknown> {
  const [version, payload] = sealed.split(".");
  if (version !== VERSION || !payload) return null;
  try {
    const bytes = fromBase64Url(payload);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, IV_BYTES) },
      await sealingKey(secret, purpose),
      bytes.subarray(IV_BYTES),
    );
    return JSON.parse(decoder.decode(plaintext)) as unknown;
  } catch {
    return null;
  }
}

/** Reading cookies: what a request's cookies offer (Next.js's `cookies()`, `NextRequest.cookies`). */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** Reading and setting cookies: what Next.js's `cookies()` in a Server Function and `NextResponse.cookies` offer. */
export interface CookieJar extends CookieReader {
  set(name: string, value: string, options: CookieOptions): unknown;
}

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: "lax" | "strict";
  secure: boolean;
  path: string;
  maxAge: number;
}

/** Splits `sealed` across `name.0`, `name.1`, ... and expires the chunks left from a longer value. */
export function writeChunkedCookie(
  jar: CookieJar,
  name: string,
  sealed: string,
  options: CookieOptions,
  previous: CookieReader = jar,
): void {
  const chunks: string[] = [];
  for (let start = 0; start < sealed.length; start += SEALED_COOKIE_CHUNK_SIZE) {
    chunks.push(sealed.slice(start, start + SEALED_COOKIE_CHUNK_SIZE));
  }
  if (chunks.length > MAX_CHUNKS) throw new Error(`Sealed cookie ${name} is too large (${sealed.length} characters)`);
  chunks.forEach((chunk, index) => jar.set(`${name}.${index}`, chunk, options));
  for (let index = chunks.length; index < MAX_CHUNKS && previous.get(`${name}.${index}`); index += 1) {
    jar.set(`${name}.${index}`, "", { ...options, maxAge: 0 });
  }
}

/** The value `writeChunkedCookie()` wrote, joined back together; null when there is none. */
export function readChunkedCookie(jar: CookieReader, name: string): string | null {
  let sealed = "";
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const chunk = jar.get(`${name}.${index}`)?.value;
    if (!chunk) break;
    sealed += chunk;
  }
  return sealed.length > 0 ? sealed : null;
}

/** Expires every chunk of `name`. */
export function clearChunkedCookie(jar: CookieJar, name: string, options: CookieOptions): void {
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    jar.set(`${name}.${index}`, "", { ...options, maxAge: 0 });
  }
}
