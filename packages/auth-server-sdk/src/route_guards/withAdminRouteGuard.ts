import { type ApiServerId } from "@schemavaults/app-definitions";
import {
  initDefaultJwtKeyManagerForAuthenticatedRouteGuard,
  type TProtectedAuthenticatedApiRoute,
  withAuthenticatedServerComponentRouteGuard,
  withAuthenticatedApiRouteGuard,
  type IBaseProtectedAuthenticatedServerComponentPageProps,
  type TProtectedAuthenticatedPageServerComponent,
} from "./withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import { type NextRequest, NextResponse } from "next/server";
import getSchemavaultsApiServerId from "@/get-schemavaults-api-server-id";
import type { IJwtKeyManager } from "@/JwtKeyManager";

export async function withAdminServerComponentRouteGuard<
  TAdditionalCustomProps extends object,
>(
  server_component: TProtectedAuthenticatedPageServerComponent<TAdditionalCustomProps>,
  additional_custom_server_component_props: TAdditionalCustomProps,
  custom_is_authorized_check:
    | ((
        props: IBaseProtectedAuthenticatedServerComponentPageProps &
          TAdditionalCustomProps,
      ) => Promise<boolean>)
    | undefined = async (props) => props.user.admin === true,
  jwt_keys_manager: IJwtKeyManager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard(),
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard<TAdditionalCustomProps>(
    server_component,
    additional_custom_server_component_props,
    "admin",
    custom_is_authorized_check,
    jwt_keys_manager,
    getApiServerId,
  );
}

export function withAdminApiRouteGuard<
  TAdditionalCustomRouteInputs extends object,
>(
  api_route_handler: TProtectedAuthenticatedApiRoute<TAdditionalCustomRouteInputs>,
  additional_custom_api_route_inputs: TAdditionalCustomRouteInputs,
  custom_is_authorized_check:
    | ((
        route_inputs: IBaseProtectedAuthenticatedServerComponentPageProps &
          TAdditionalCustomRouteInputs,
      ) => Promise<boolean>)
    | undefined = async (inputs) => inputs.user.admin === true,
  jwt_keys_manager: IJwtKeyManager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard(),
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): (req: NextRequest) => Promise<NextResponse> {
  return withAuthenticatedApiRouteGuard(
    api_route_handler,
    additional_custom_api_route_inputs,
    "admin",
    custom_is_authorized_check,
    jwt_keys_manager,
    getApiServerId,
  );
}

export type {
  TProtectedAuthenticatedPageServerComponent as TProtectedAdminPageServerComponent,
  TProtectedAuthenticatedApiRoute as TProtectedAdminApiRoute,
  IBaseProtectedAuthenticatedServerComponentPageProps as IBaseProtectedAdminServerComponentPageProps,
  IBaseProtectedAuthenticatedApiRouteInputs as IBaseProtectedAdminApiRouteInputs,
} from "./withAuthenticatedRouteGuard";
