import type { ApiServerId } from "@schemavaults/app-definitions";
import {
  initDefaultJwtKeyManagerForAuthenticatedRouteGuard,
  type TProtectedAuthenticatedApiRoute,
  withAuthenticatedApiRouteGuard,
  type IBaseProtectedAuthenticatedApiRouteInputs,
} from "@/route_guards/withAuthenticatedRouteGuard";
import type { NextRequest, NextResponse } from "next/server";
import getSchemavaultsApiServerId from "@/get-schemavaults-api-server-id";
import type { IJwtKeyManager } from "@/JwtKeyManager";

type TAdditionalRouteInputs<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs = IBaseProtectedAuthenticatedApiRouteInputs,
> = Omit<TRouteInputs, keyof IBaseProtectedAuthenticatedApiRouteInputs>;

export function withAdminApiRouteGuard<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs = IBaseProtectedAuthenticatedApiRouteInputs,
>(
  api_route_handler: TProtectedAuthenticatedApiRoute<TRouteInputs>,
  additional_custom_api_route_inputs:
    | TAdditionalRouteInputs<TRouteInputs>
    | undefined = undefined,
  custom_is_authorized_check:
    | ((route_inputs: TRouteInputs) => Promise<boolean>)
    | undefined = async (inputs) => inputs.user.admin === true,
  jwt_keys_manager: IJwtKeyManager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard(),
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): (req: NextRequest) => Promise<NextResponse> {
  return withAuthenticatedApiRouteGuard<TRouteInputs>(
    api_route_handler,
    additional_custom_api_route_inputs,
    "admin",
    custom_is_authorized_check,
    jwt_keys_manager,
    getApiServerId,
  );
}

export default withAdminApiRouteGuard;

export type {
  TProtectedAuthenticatedApiRoute as TProtectedAdminApiRoute,
  IBaseProtectedAuthenticatedApiRouteInputs as IBaseProtectedAdminApiRouteInputs,
} from "@/route_guards/withAuthenticatedRouteGuard";
