"use client";

import type { AppId } from "@schemavaults/app-definitions";
import { createContext } from "react";

export const AppIdContext = createContext<AppId | null>(null);
export default AppIdContext;
