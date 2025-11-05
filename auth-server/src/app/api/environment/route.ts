
import { getAppEnvironment } from "@schemavaults/app-definitions";
import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  const environment = getAppEnvironment();
  return NextResponse.json({ environment });
}
