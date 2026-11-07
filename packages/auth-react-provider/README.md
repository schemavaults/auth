# @schemavaults/auth-react-provider

This package uses the upstream package [@schemavaults/auth-client-sdk](../auth-client-sdk/README.md)'s TypeScript client to handle authentication in Next.js/React.js applications
## Asking for your API's scopes at sign-in

Pass `authorization_params` to `<SchemaVaultsAuthProvider>` (or to the
`auth-provider.tsx` that `auth-server-sdk codegen` writes) to make every
sign-in ask for them, e.g. a first-party app whose tokens must carry its own
API's scopes:

```tsx
// Module level, so the value stays stable across renders.
const AUTHORIZATION_PARAMS = {
  scope: "openid email profile notes:read notes:write",
  resource: "my-notes-api",
} as const;

<SchemaVaultsAuthProvider
  app_id="my-web-app"
  default_audiences={["my-notes-api"]}
  authorization_params={AUTHORIZATION_PARAMS}
  /* ... */
>
  {children}
</SchemaVaultsAuthProvider>
```

The generated `/auth/login` and `/auth/register` pages, the auth middleware
and `login()` / `register()` calls without their own `scope` ask for them. A
signed-in session whose sign-in asked for less (it predates the scopes you
list, e.g. after you add one) is sent through the authorization flow again,
from the page it is on and back to it (`useReauthorizeOutdatedSession()`,
which the provider mounts; see `needsReauthorization()` in the
[client SDK](../auth-client-sdk/README.md#asking-for-api-scopes-at-sign-in-authorization_params)).
It happens at most once per tab for the same params and never on the sign-in
flow's own pages (`/auth/*`); while the user's auth server session lasts there
is no password prompt, and the consent screen lists only the scopes not
granted yet. The `/auth/authorize` page (`useTradeAuthorizationCodeForTokensEffect()`)
then redeems the new code although the app already has a session, replacing
it; a user who declines keeps the session they had.

## Error reporting

The auth client SDK reports the failures of its own auth flows to the auth
server, where platform administrators browse them on `/admin/client-errors`
(see [Error reporting](../auth-client-sdk/README.md#error-reporting)). Pass
`disable_telemetry` to `<SchemaVaultsAuthProvider>` to send nothing:

```tsx
<SchemaVaultsAuthProvider app_id="my-web-app" environment="production" disable_telemetry /* ... */>
  {children}
</SchemaVaultsAuthProvider>
```
