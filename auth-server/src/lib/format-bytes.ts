const KIB: number = 1024;

/** A byte count for display, in binary units: `512 B`, `812 KB`, `3.4 MB`, `1.2 GB`. Isomorphic. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < KIB) return `${Math.max(0, Math.round(bytes))} B`;
  const units: readonly string[] = ["KB", "MB", "GB", "TB"];
  let value: number = bytes / KIB;
  let unit: number = 0;
  while (value >= KIB && unit < units.length - 1) {
    value /= KIB;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export default formatBytes;
