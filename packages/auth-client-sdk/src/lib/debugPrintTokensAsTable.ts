import type { SuccessfullyGeneratedTokensRecord } from "@schemavaults/auth-common";

export default function debugPrintTokensAsTable(
  tokens: SuccessfullyGeneratedTokensRecord,
): void {
  try {
    const { access, refresh } = tokens;
    console.table({
      ...access,
      refresh,
    });
  } catch (e: unknown) {
    void e;
    console.warn(
      "Failed to print received tokens to console within a table: ",
      e,
    );
  }
}
