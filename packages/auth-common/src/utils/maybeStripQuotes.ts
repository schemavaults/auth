export function maybeStripQuotes(
  maybeQuotes?: string | undefined,
): string | undefined {
  if (!maybeQuotes) return maybeQuotes;
  const trimmed = maybeQuotes.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export default maybeStripQuotes;
