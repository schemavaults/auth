import { describe, expect, test } from "bun:test";
import { redirectToLogin } from "./redirect-to-login";

function captureRedirect(next_href?: string): string {
  let captured: string | null = null;
  class RedirectSignal extends Error {}
  const redirect = (url: string): never => {
    captured = url;
    throw new RedirectSignal(url);
  };
  try {
    redirectToLogin(redirect, next_href);
  } catch (e: unknown) {
    if (!(e instanceof RedirectSignal)) throw e;
  }
  if (captured === null) {
    throw new Error("redirectToLogin did not call redirect");
  }
  return captured;
}

describe("redirectToLogin", () => {
  test("redirects to /auth/login with no params by default", () => {
    expect(captureRedirect()).toBe("/auth/login");
  });

  test("forwards a safe internal path as next_href", () => {
    expect(captureRedirect("/account")).toBe(
      "/auth/login?next_href=%2Faccount",
    );
  });

  test("forwards paths with query strings", () => {
    expect(captureRedirect("/org/acme?tab=members")).toBe(
      "/auth/login?next_href=" + encodeURIComponent("/org/acme?tab=members"),
    );
  });

  test("drops absolute URLs (open redirect attempt)", () => {
    expect(captureRedirect("https://evil.example/phish")).toBe("/auth/login");
  });

  test("drops protocol-relative URLs", () => {
    expect(captureRedirect("//evil.example")).toBe("/auth/login");
  });

  test("drops non-rooted paths", () => {
    expect(captureRedirect("account")).toBe("/auth/login");
  });
});
