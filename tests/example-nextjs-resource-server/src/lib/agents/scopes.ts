// NOT server-only: the new-session screen lists these too.
import { exampleApiScopes, oidcScopes } from "@/lib/api/scopes";

/**
 * What a user can let an agent do, one checkbox each on the new-session
 * screen. The app asks for all of them when the user signs in (they consent
 * to each on the auth server's consent screen); every agent session then gets
 * a delegated token narrowed to the ones its user picked, so an agent never
 * holds more than its session needs.
 */
export interface AgentScopeOption {
  /** The OAuth scope value. */
  scope: string;
  /** What the scope lets the agent do, as the user reads it. */
  label: string;
  /** The API operation that needs it. */
  operation: string;
}

/** `GET /api/me/notes` (see src/app/api/me/notes/operation.ts). */
export const NOTES_READ_SCOPE = exampleApiScopes.notesRead.scope;

/**
 * Labelled with the scopes' own descriptions (src/lib/api/scopes.ts), the
 * ones the API docs show for the operations requiring them.
 */
export const AGENT_SCOPE_OPTIONS: readonly AgentScopeOption[] = [
  { scope: oidcScopes.email.scope, label: oidcScopes.email.description, operation: "GET /api/me/email" },
  {
    scope: exampleApiScopes.notesRead.scope,
    label: exampleApiScopes.notesRead.description,
    operation: "GET /api/me/notes",
  },
];

/**
 * The scope the app signs users in with: OIDC sign-in plus everything an
 * agent may be given. The access token minted for the example API server
 * (the RFC 8707 `resource`) carries it, and is what each agent session's
 * delegated token is exchanged from.
 */
export const AGENTS_SIGN_IN_SCOPE: string = [
  "openid",
  ...AGENT_SCOPE_OPTIONS.map((option) => option.scope),
].join(" ");

/**
 * The scope a delegated token is requested with for the options a user
 * picked. `openid` is always included: the token exchange takes a subset of
 * the subject token's scope, never an empty one, so a session given nothing
 * else still gets a token that can call the operations needing no scope
 * (e.g. `GET /api/whoami`).
 */
export function delegatedScopeFor(selected: readonly string[]): string {
  const offered = new Set(AGENT_SCOPE_OPTIONS.map((option) => option.scope));
  const picked = AGENT_SCOPE_OPTIONS.map((option) => option.scope).filter(
    (scope) => selected.includes(scope) && offered.has(scope),
  );
  return ["openid", ...picked].join(" ");
}
