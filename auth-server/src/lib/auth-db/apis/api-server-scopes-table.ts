import type { ApiServerScope } from "@schemavaults/auth-common";
import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export type ApiServerScopesTable = ApiServerScope;

export type ApiServerScopeRow = Selectable<ApiServerScopesTable>;
export type NewApiServerScopeRow = Insertable<ApiServerScopesTable>;
export type ApiServerScopeRowUpdate = Updateable<ApiServerScopesTable>;
