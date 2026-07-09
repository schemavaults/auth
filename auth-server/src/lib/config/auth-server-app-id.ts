import "server-only";

/**
 * @description Server-only import surface for the auth server's own app id.
 * The canonical env-var resolution (SCHEMAVAULTS_AUTH_SERVER_APP_ID) lives in
 * @schemavaults/app-definitions; this module exists so auth-server code has a
 * single, explicitly server-side place to import it from. Client components
 * must receive the resolved value via context/props instead (see
 * AuthServerAppIdProvider in @schemavaults/auth-react-provider).
 */
export {
  getAuthServerAppId,
  DEFAULT_AUTH_SERVER_APP_ID,
} from "@schemavaults/app-definitions";

export { getAuthServerAppId as default } from "@schemavaults/app-definitions";
