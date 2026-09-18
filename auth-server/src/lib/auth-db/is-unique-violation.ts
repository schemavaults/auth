import "server-only";

/**
 * Postgres signals a unique-constraint violation with SQLSTATE 23505. The
 * error surface differs between the direct `pg` Pool adapter and the
 * Neon-compatible WebSocket proxy, so match the code where present and fall
 * back to Postgres' "duplicate key value violates unique constraint" message.
 */
export function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  if (code === "23505") return true;
  const message = (e as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.includes("duplicate key value violates unique constraint")
  );
}

export default isUniqueViolation;
