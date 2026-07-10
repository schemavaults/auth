// Shared (server & client) fallback for SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME.
// Lives in its own directive-free module so both the server-only getter and
// client components can import it. Re-exported from
// @schemavaults/app-definitions, where the canonical getter now lives.
export { DEFAULT_AUTH_SERVER_FRIENDLY_NAME } from "@schemavaults/app-definitions";

export { DEFAULT_AUTH_SERVER_FRIENDLY_NAME as default } from "@schemavaults/app-definitions";
