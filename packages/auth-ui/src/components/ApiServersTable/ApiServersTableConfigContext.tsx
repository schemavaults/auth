"use client";

import type { ListApiServersQueryType } from "@schemavaults/app-definitions";
import { createContext } from "react";

export interface ApiServersTableConfig {
  showConnectAppToApi: boolean;
  isOrgOwner: boolean;
  queryType?: ListApiServersQueryType;
}

export const ApiServersTableConfigContext =
  createContext<ApiServersTableConfig>({
    showConnectAppToApi: false,
    isOrgOwner: false,
    queryType: undefined,
  });
