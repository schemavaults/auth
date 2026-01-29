export default function uuid(): string {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error("Crypto.randomUUID is not available in this runtime!");
  }
  return crypto.randomUUID();
}
