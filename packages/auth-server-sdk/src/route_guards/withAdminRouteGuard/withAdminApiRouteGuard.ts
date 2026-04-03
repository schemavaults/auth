import {
  type TProtectedAuthenticatedApiRoute,
  withAuthenticatedApiRouteGuard,
  type IBaseProtectedAuthenticatedApiRouteInputs,
} from "@/route_guards/withAuthenticatedRouteGuard";
import type { NextRequest, NextResponse } from "next/server";
import type { IWithAuthenticatedApiRouteGuardAdditionalOptions } from "../withAuthenticatedRouteGuard/withAuthenticatedApiRouteGuard";

type TAdditionalRouteInputs<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
> = Omit<TRouteInputs, keyof IBaseProtectedAuthenticatedApiRouteInputs>;

export interface IWithAdminApiRouteGuardAdditionalOptions extends Omit<
  IWithAuthenticatedApiRouteGuardAdditionalOptions,
  "route_guard_type"
> {
  route_guard_type?: "admin";
}

export function withAdminApiRouteGuard<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
>(
  api_route_handler: TProtectedAuthenticatedApiRoute<TRouteInputs>,
  additional_custom_api_route_inputs:
    | TAdditionalRouteInputs<TRouteInputs>
    | undefined = undefined,
  opts?: IWithAdminApiRouteGuardAdditionalOptions,
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
