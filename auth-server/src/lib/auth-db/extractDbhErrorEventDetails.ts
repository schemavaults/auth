/**
 * Extracts a meaningful error message from various error types,
 * including ErrorEvent objects that come from WebSocket connections.
 *
 * This is particularly useful for database connection errors that may
 * come through as ErrorEvent objects with minimal useful information
 * when directly logged.
 */
export function extractDbhErrorEventDetails(e: unknown): string {
  // Handle standard Error objects
  if (e instanceof Error) {
    const parts: string[] = [`${e.name}: ${e.message}`];

    // Include stack trace if available
    if (e.stack) {
      parts.push(`\nStack: ${e.stack}`);
    }

    // Include cause if available (ES2022+)
    if ("cause" in e && e.cause) {
      parts.push(`\nCause: ${extractDbhErrorEventDetails(e.cause)}`);
    }

    return parts.join("");
  }

  // Handle ErrorEvent (common with WebSocket/database proxy errors)
  if (
    typeof e === "object" &&
    e !== null &&
    "type" in e &&
    e.type === "error"
  ) {
    const errorEvent: ErrorEvent = e as ErrorEvent;
    const parts: string[] = ["ErrorEvent"];

    // Extract message if available
    if ("message" in errorEvent && errorEvent.message) {
      parts.push(`message: "${errorEvent.message}"`);
    }

    // Extract nested error if available
    if ("error" in errorEvent && errorEvent.error) {
      parts.push(`error: ${extractDbhErrorEventDetails(errorEvent.error)}`);
    }

    // Extract target information (e.g., WebSocket URL, readyState)
    if ("target" in errorEvent && errorEvent.target) {
      const target: EventTarget = errorEvent.target;
      const targetParts: string[] = [];

      if ("url" in target && target.url) {
        targetParts.push(`url: "${target.url}"`);
      }

      if (
        "readyState" in target &&
        target.readyState !== undefined &&
        typeof target.readyState === "number"
      ) {
        const readyStateNames = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
        const readyStateName =
          readyStateNames[target.readyState] || `UNKNOWN(${target.readyState})`;
        targetParts.push(
          `readyState: ${readyStateName} (${target.readyState})`,
        );
      }

      if (targetParts.length > 0) {
        parts.push(`target: {${targetParts.join(", ")}}`);
      }
    }

    // Extract timestamp if available
    if ("timeStamp" in errorEvent && typeof errorEvent.timeStamp === "number") {
      parts.push(`timeStamp: ${errorEvent.timeStamp}ms`);
    }

    return parts.join(", ");
  }

  // Handle string errors
  if (typeof e === "string") {
    return e;
  }

  // Try to serialize other objects
  if (typeof e === "object" && e !== null) {
    try {
      // Attempt to extract useful properties
      const obj: object = e;
      const parts: string[] = [];

      if ("message" in obj && obj.message)
        parts.push(`message: "${obj.message}"`);
      if ("code" in obj && obj.code) parts.push(`code: ${obj.code}`);
      if ("name" in obj && obj.name) parts.push(`name: ${obj.name}`);

      if (parts.length > 0) {
        return `Object {${parts.join(", ")}}`;
      }

      // Fall back to JSON.stringify
      return JSON.stringify(e, null, 2);
    } catch {
      return String(e);
    }
  }

  // Fall back to string conversion
  return String(e);
}

export default extractDbhErrorEventDetails;
