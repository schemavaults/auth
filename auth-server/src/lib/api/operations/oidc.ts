import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { oidcAuthorize } from "@/app/api/oidc/authorize/operation";
import { postOidcIntrospect } from "@/app/api/oidc/introspect/operation";
import { getOidcJwks } from "@/app/api/oidc/jwks/operation";
import { getOpenIdConfiguration } from "@/app/api/oidc/openid-configuration/operation";
import { postOidcRegister } from "@/app/api/oidc/register/operation";
import { postOidcToken } from "@/app/api/oidc/token/operation";
import { getOidcUserinfo, postOidcUserinfo } from "@/app/api/oidc/userinfo/operation";

/** Operations of the "oidc" domain, in the order they appear in the docs. */
export const oidcOperations: readonly AnyOperationDefinition[] = [
  getOpenIdConfiguration,
  getOidcJwks,
  oidcAuthorize,
  postOidcToken,
  getOidcUserinfo,
  postOidcUserinfo,
  postOidcIntrospect,
  postOidcRegister,
];
