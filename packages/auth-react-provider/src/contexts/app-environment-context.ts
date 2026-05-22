"use client";

import { createContext } from "react";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export const SchemaVaultsAppEnvironmentContext =
  createContext<SchemaVaultsAppEnvironment | null>(null);

export default SchemaVaultsAppEnvironmentContext;
