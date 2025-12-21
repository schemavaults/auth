import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { NextResponse } from "next/server";

export function GET(): NextResponse {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  return NextResponse.json({ environment });
}
