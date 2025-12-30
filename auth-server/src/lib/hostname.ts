import type { NextRequest } from "next/server";

export default function getHostname(req: NextRequest | Request): string {
  return req.headers.get("host") || "localhost";
}
