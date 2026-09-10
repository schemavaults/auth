"use client";

import type { ListApiServersQueryType } from "@schemavaults/app-definitions";
import { createContext } from "react";

export interface ApiServersTableConfig {
  showConnectAppToApi: boolean;
  isOrgOwner: boolean;
  queryType?: ListApiServersQueryType;
  /**
   * For the "accessible" query: ids of the organizations in which the
   * viewer is an owner/admin (decides which rows expose management
   * actions).
   */
  managedOrganizationIds?: readonly string[];
}

export const ApiServersTableConfigContext =
  createContext<ApiServersTableConfig>({
    showConnectAppToApi: false,
    isOrgOwner: false,
    queryType: undefined,
    managedOrganizationIds: undefined,
  });
