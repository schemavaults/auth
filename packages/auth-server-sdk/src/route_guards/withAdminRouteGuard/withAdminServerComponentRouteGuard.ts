import { type ApiServerId } from "@schemavaults/app-definitions";
import {
  initDefaultJwtKeyManagerForAuthenticatedRouteGuard,
  withAuthenticatedServerComponentRouteGuard,
  type IBaseProtectedAuthenticatedServerComponentPageProps,
  type TProtectedAuthenticatedPageServerComponent,
} from "@/route_guards/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import getSchemavaultsApiServerId from "@/get-schemavaults-api-server-id";
import type { IJwtKeyManager } from "@/JwtKeyManager";

type TAdditionalProps<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps,
> = Omit<TProps, keyof IBaseProtectedAuthenticatedServerComponentPageProps>;

export async function withAdminServerComponentRouteGuard<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps,
>(
  server_component: TProtectedAuthenticatedPageServerComponent<TProps>,
  additional_custom_server_component_props:
    | TAdditionalProps<TProps>
    | undefined = undefined,
  custom_is_authorized_check:
    | ((props: TProps) => Promise<boolean>)
    | undefined = async (props) => props.user.admin === true,
  jwt_keys_manager: IJwtKeyManager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard(),
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard<TProps>(
    server_component,
    additional_custom_server_component_props,
    "admin",
    custom_is_authorized_check,
    jwt_keys_manager,
    getApiServerId,
  );
}

export type {
  TProtectedAuthenticatedPageServerComponent as TProtectedAdminPageServerComponent,
  IBaseProtectedAuthenticatedServerComponentPageProps as IBaseProtectedAdminServerComponentPageProps,
} from "@/route_guards/withAuthenticatedRouteGuard";
