"use client";

import { createContext } from "react";

export interface ApiServersTableConfig {
  showConnectAppToApi: boolean;
  isOrgOwner: boolean;
}

export const ApiServersTableConfigContext =
  createContext<ApiServersTableConfig>({
    showConnectAppToApi: false,
    isOrgOwner: false,
  });
