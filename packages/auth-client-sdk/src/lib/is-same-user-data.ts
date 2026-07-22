import type { UserData } from "@schemavaults/auth-common";

/**
 * Compare two cached user data snapshots for equality, independent of key
 * order (one side typically comes from a server JSON response, the other from
 * the adapter's storage round-trip). UserData is a flat object, so comparing
 * sorted-key serializations is sufficient.
 */
export function isSameUserData(
  a: UserData | null,
  b: UserData | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return stableSerialize(a) === stableSerialize(b);
}

function stableSerialize(user: UserData): string {
  const record = user as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(record)
      // A key present with value undefined is equivalent to an absent key
      // (JSON round-trips drop it either way).
      .filter((key): boolean => record[key] !== undefined)
      .sort()
      .map((key): [string, unknown] => [key, record[key]]),
  );
}

export default isSameUserData;
