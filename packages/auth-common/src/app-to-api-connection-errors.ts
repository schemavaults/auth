/**
 * Thrown by the auth client SDK when the auth server rejects an app-to-API
 * connection request with a 409 Conflict because the connection already
 * exists. Lives in auth-common so UI layers can recognize the case without
 * depending on the client SDK directly.
 */
export class AppAlreadyConnectedToApiServerError extends Error {
  constructor(message = "This app is already connected to this API server.") {
    super(message);
    this.name = "AppAlreadyConnectedToApiServerError";
  }
}

/**
 * Prefer this over a bare `instanceof` check: it also matches by error name,
 * so it keeps working if a bundler ends up with duplicate copies of
 * auth-common (e.g. in an external resource server).
 */
export function isAppAlreadyConnectedToApiServerError(
  e: unknown,
): e is AppAlreadyConnectedToApiServerError {
  return (
    e instanceof AppAlreadyConnectedToApiServerError ||
    (e instanceof Error && e.name === "AppAlreadyConnectedToApiServerError")
  );
}
