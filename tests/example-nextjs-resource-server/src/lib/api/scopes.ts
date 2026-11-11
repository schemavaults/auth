// NOT server-only: the agents' new-session screen labels its scope
// checkboxes with these too. `@schemavaults/auth-common/scopes` has no
// runtime dependencies, so this stays cheap in a client bundle.
import { defineScopes, oidcScopes } from "@schemavaults/auth-common/scopes";

export { oidcScopes };

/**
 * The API scopes this resource server defines. Operations require them by
 * definition (`requiredScopes: [exampleApiScopes.notesRead]`), the OpenAPI
 * document and the /docs pages describe them from here, the agents' token
 * exchange narrows to them, and the same list is what a scope sync would
 * send to the auth server
 * (`syncApiServerScopes({ scopes: Object.values(exampleApiScopes) })` from
 * `@schemavaults/auth-server-sdk/api-scopes`). The E2E suite defines them on
 * the example API server with these descriptions.
 */
export const exampleApiScopes = defineScopes({
  notesRead: { scope: "example:notes.read", description: "Read your notes" },
});
