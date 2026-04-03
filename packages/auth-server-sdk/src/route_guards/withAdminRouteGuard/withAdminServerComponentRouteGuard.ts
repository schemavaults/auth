import {
  withAuthenticatedServerComponentRouteGuard,
  type IBaseProtectedAuthenticatedServerComponentPageProps,
  type TProtectedAuthenticatedPageServerComponent,
} from "@/route_guards/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import type { IWithAuthenticatedServerComponentRouteGuardAdditionalOptions } from "@/route_guards/withAuthenticatedRouteGuard/withAuthenticatedServerComponentRouteGuard";

type TAdditionalProps<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps =
    IBaseProtectedAuthenticatedServerComponentPageProps,
> = Omit<TProps, keyof IBaseProtectedAuthenticatedServerComponentPageProps>;

export interface IWithAdminApiRouteGuardAdditionalOptions extends Omit<
  IWithAuthenticatedServerComponentRouteGuardAdditionalOptions,
  "route_guard_type"
> {
  route_guard_type?: "admin";
}

export async function withAdminServerComponentRouteGuard<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps =
    IBaseProtectedAuthenticatedServerComponentPageProps,
>(
  server_component: TProtectedAuthenticatedPageServerComponent<TProps>,
  additional_custom_server_component_props:
    | TAdditionalProps<TProps>
    | undefined = undefined,
  opts?: IWithAdminApiRouteGuardAdditionalOptions,
): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard<TProps>(
    server_component,
    additional_custom_server_component_props,
    {
      ...opts,
      route_guard_type: "admin",
      custom_is_authorized_check: async (props) => {
        if (!props.user.admin) {
          return false;
        }

        if (typeof opts?.custom_is_authorized_check === "function") {
          return (await opts.custom_is_authorized_check(props)) ? true : false;
        } else {
          return props.user.admin ? true : false;
        }
      },
    },
  );
}

export type {
  TProtectedAuthenticatedPageServerComponent as TProtectedAdminPageServerComponent,
  IBaseProtectedAuthenticatedServerComponentPageProps as IBaseProtectedAdminServerComponentPageProps,
} from "@/route_guards/withAuthenticatedRouteGuard";
