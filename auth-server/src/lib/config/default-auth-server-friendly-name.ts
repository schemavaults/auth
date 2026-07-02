// Shared (server & client) fallback for SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME.
// Lives in its own directive-free module so both the server-only getter and
// client components can import it.
export const DEFAULT_AUTH_SERVER_FRIENDLY_NAME = "SchemaVaults Auth";

export default DEFAULT_AUTH_SERVER_FRIENDLY_NAME;
