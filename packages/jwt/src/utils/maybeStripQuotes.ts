/**
 *
 * @param maybeQuotes A string or undefined
 * @returns If the string is wrapped in quotes or whitespace, returns string without those quotes/whitespace
 * @description Useful helper for parsing environment variables
 */
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
