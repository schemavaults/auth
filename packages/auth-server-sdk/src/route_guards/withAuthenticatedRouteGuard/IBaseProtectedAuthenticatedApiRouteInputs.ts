import type { NextRequest } from "next/server";
import type { IBaseProtectedAuthenticatedServerComponentPageProps } from "./IBaseProtectedAuthenticatedServerComponentPageProps";

export interface IBaseProtectedAuthenticatedApiRouteInputs
  extends IBaseProtectedAuthenticatedServerComponentPageProps {
  req: NextRequest;
}
