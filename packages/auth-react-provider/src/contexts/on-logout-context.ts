"use client";

import { createContext } from "react";

export type OnLogoutCallback = () => void | Promise<void>;

export const OnLogoutContext = createContext<OnLogoutCallback | null>(null);

export default OnLogoutContext;
