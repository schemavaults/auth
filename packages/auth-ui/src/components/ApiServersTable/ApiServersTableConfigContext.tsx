"use client";

import { createContext } from "react";

export interface ApiServersTableConfig {
  showConnectAppToApi: boolean;
}

export const ApiServersTableConfigContext =
  createContext<ApiServersTableConfig>({
    showConnectAppToApi: false,
  });
