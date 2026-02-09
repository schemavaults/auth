"use client";

import type { ApiServerId } from "@schemavaults/app-definitions";
import { createContext } from "react";

export const DefaultAccessTokenAudiencesContext = createContext<
  readonly ApiServerId[] | undefined | null
>(null);

export default DefaultAccessTokenAudiencesContext;
