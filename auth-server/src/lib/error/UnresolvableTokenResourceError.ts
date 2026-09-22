/**
 * Thrown when an RFC 8707 `resource` (token audience) cannot be mapped to
 * exactly one registered API server: the value is a URL no API server has
 * registered a matching domain for (`unknown`), or more than one API
 * server matches it (`ambiguous`), or it names an API server id that does
 * not exist (`unknown`).
 */
export type UnresolvableTokenResourceReason = "unknown" | "ambiguous";

export class UnresolvableTokenResourceError extends Error {
  public readonly resource: string;
  public readonly reason: UnresolvableTokenResourceReason;

  public constructor(resource: string, reason: UnresolvableTokenResourceReason) {
    super(
      reason === "ambiguous"
        ? `The resource '${resource}' matches more than one registered API server`
        : `The resource '${resource}' does not identify a registered API server`,
    );
    this.name = "UnresolvableTokenResourceError";
    this.resource = resource;
    this.reason = reason;
  }
}

export default UnresolvableTokenResourceError;
