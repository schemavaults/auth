import type { ApiServerId } from "@schemavaults/app-definitions";
import {
  initDefaultJwtKeyManagerForAuthenticatedRouteGuard,
  type TProtectedAuthenticatedApiRoute,
  withAuthenticatedApiRouteGuard,
  type IBaseProtectedAuthenticatedApiRouteInputs,
} from "@/route_guards/withAuthenticatedRouteGuard";
import type { NextRequest, NextResponse } from "next/server";
import type { IJwtKeyManager } from "@/JwtKeyManager";
import { IWithAuthenticatedApiRouteGuardAdditionalOptions } from "../withAuthenticatedRouteGuard/withAuthenticatedApiRouteGuard";

type TAdditionalRouteInputs<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
> = Omit<TRouteInputs, keyof IBaseProtectedAuthenticatedApiRouteInputs>;

export function withAdminApiRouteGuard<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
>(
  api_route_handler: TProtectedAuthenticatedApiRoute<TRouteInputs>,
  additional_custom_api_route_inputs:
    | TAdditionalRouteInputs<TRouteInputs>
    | undefined = undefined,
  opts?: IWithAuthenticatedApiRouteGuardAdditionalOptions,
): (req: NextRequest) => Promise<NextResponse> {
  return withAuthenticatedApiRouteGuard<TRouteInputs>(
    api_route_handler,
    additional_custom_api_route_inputs,
    { ...opts, route_guard_type: "admin" },
  );
}

export default withAdminApiRouteGuard;

export type {
  TProtectedAuthenticatedApiRoute as TProtectedAdminApiRoute,
  IBaseProtectedAuthenticatedApiRouteInputs as IBaseProtectedAdminApiRouteInputs,
} from "@/route_guards/withAuthenticatedRouteGuard";
