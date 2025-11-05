export function assertNoOriginSet(
  origin: string | null | undefined,
): origin is null | undefined {
  if (typeof origin === "string") {
    return false;
  }

  return true;
}
