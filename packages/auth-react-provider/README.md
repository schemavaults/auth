# @schemavaults/auth-react-provider

This package uses the upstream package [@schemavaults/auth-client-sdk](../auth-client-sdk/README.md)'s TypeScript client to handle authentication in Next.js/React.js applications
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
