const KIB: number = 1024;

/** A byte count for display, in binary units: `512 B`, `812 KB`, `2 MB`, `3.4 MB`, `1.2 GB`. Isomorphic. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < KIB) return `${Math.max(0, Math.round(bytes))} B`;
  const units: readonly string[] = ["KB", "MB", "GB", "TB"];
  let value: number = bytes / KIB;
  let unit: number = 0;
  while (value >= KIB && unit < units.length - 1) {
    value /= KIB;
    unit += 1;
  }
  // One decimal below 10 of a unit, without a trailing ".0" (`2 MB`, not `2.0 MB`).
  const amount: string = value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
  return `${amount} ${units[unit]}`;
}

export default formatBytes;
