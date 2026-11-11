// NOT server-only: the new-session screen lists these too.
import { formatScope, type ScopeDefinition } from "@schemavaults/auth-common/scopes";
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

/** The scopes an agent may be given, with the API operation needing each. */
const AGENT_SCOPES: readonly { definition: ScopeDefinition; operation: string }[] = [
  { definition: oidcScopes.email, operation: "GET /api/me/email" },
  { definition: exampleApiScopes.notesRead, operation: "GET /api/me/notes" },
];

/**
 * Labelled with the scopes' own descriptions (src/lib/api/scopes.ts), the
 * ones the API docs show for the operations requiring them.
 */
export const AGENT_SCOPE_OPTIONS: readonly AgentScopeOption[] = AGENT_SCOPES.map(
  ({ definition, operation }) => ({
    scope: definition.scope,
    label: definition.description,
    operation,
  }),
);

/**
 * The scope the app signs users in with: OIDC sign-in plus everything an
 * agent may be given. The access token minted for the example API server
 * (the RFC 8707 `resource`) carries it, and is what each agent session's
 * delegated token is exchanged from.
 */
export const AGENTS_SIGN_IN_SCOPE: string = formatScope([
  oidcScopes.openid,
  ...AGENT_SCOPES.map(({ definition }) => definition),
]);

/**
 * The scopes a delegated token is requested with for the options a user
 * picked, as definitions (the server SDK's token exchange takes them as
 * they are). `openid` is always included: the token exchange takes a subset
 * of the subject token's scope, never an empty one, so a session given
 * nothing else still gets a token that can call the operations needing no
 * scope (e.g. `GET /api/whoami`). Unoffered values are ignored.
 */
export function delegatedScopesFor(selected: readonly string[]): ScopeDefinition[] {
  return [
    oidcScopes.openid,
    ...AGENT_SCOPES.map(({ definition }) => definition).filter((definition) =>
      selected.includes(definition.scope),
    ),
  ];
}

/** {@link delegatedScopesFor}, space-delimited. */
export function delegatedScopeFor(selected: readonly string[]): string {
  return formatScope(delegatedScopesFor(selected));
}
