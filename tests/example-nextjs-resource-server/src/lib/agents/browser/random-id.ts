// NOT server-only: runs in the browser (unit tested).

/**
 * 32 random hex characters (128 bits). Not `crypto.randomUUID()`: browsers
 * only offer that in secure contexts (HTTPS and localhost), and the example
 * also runs on plain-http hosts, such as the E2E suite's Docker network.
 * `crypto.getRandomValues()` works in any context.
 */
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
