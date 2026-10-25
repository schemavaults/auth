/** One reason a scope manifest was refused. */
export interface ApiScopeManifestIssue {
  /** Where in the manifest, e.g. `scopes.1.description`. */
  readonly path: string;
  readonly message: string;
}

/**
 * The scope manifest failed the shared request schema on this machine; the
 * auth server was not called.
 */
export class InvalidApiScopeManifestError extends TypeError {
  readonly issues: readonly ApiScopeManifestIssue[];

  constructor(issues: readonly ApiScopeManifestIssue[]) {
    super(
      `Invalid API scope manifest:\n${issues.map((issue) => `  - ${issue.path || "(manifest)"}: ${issue.message}`).join("\n")}`,
    );
    this.name = "InvalidApiScopeManifestError";
    this.issues = issues;
  }
}

/**
 * The auth server refused the sync (any answer but 200), or answered with
 * an unexpected body.
 */
export class ApiScopeSyncFailedError extends Error {
  /** HTTP status of the answer (200 for an unexpected success body). */
  readonly status: number;
  /**
   * The response's machine readable `error` code (e.g. `validation_error`,
   * `invalid_assertion`, `too_many_scopes`), or null when it carried none.
   */
  readonly code: string | null;
  /** The offending fields of a `validation_error` answer. */
  readonly issues: readonly ApiScopeManifestIssue[];

  constructor(
    message: string,
    {
      status,
      code = null,
      issues = [],
      cause,
    }: {
      status: number;
      code?: string | null;
      issues?: readonly ApiScopeManifestIssue[];
      cause?: unknown;
    },
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiScopeSyncFailedError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}
