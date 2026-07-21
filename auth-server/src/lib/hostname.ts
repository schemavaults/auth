import type { NextRequest } from "next/server";

export default function getHostname(req: NextRequest | Request): string {
  const hostHeader: string | null = req.headers.get("host") ?? req.headers.get("Host");

  if (!hostHeader) {
    throw new Error("Expected 'Host' header to be defined on request")
  }

  // The Host header may include a port (e.g. "127.0.0.1:6767" in development,
  // or a white-label deployment on a nonstandard port). Every caller uses this
  // value as a cookie Domain attribute, which must be a bare hostname —
  // browsers reject Set-Cookie headers whose Domain contains a port, silently
  // dropping the auth cookies. Parse via URL to also handle IPv6 literals
  // (e.g. "[::1]:6767").
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    throw new Error(`Failed to parse hostname from 'Host' request header!`);
  }
}
