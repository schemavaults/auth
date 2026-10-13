import { describe, expect, test } from "bun:test";
import {
  type CookieDomainProbe,
  findRegistrableDomain,
  isSameSiteAsAuthServer,
} from "./same-site-as-auth-server";

// Stand-in for the browser's Public Suffix List: a cookie Domain is refused
// when it is a public suffix.
const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  "com",
  "ca",
  "uk",
  "co.uk",
  "io",
  "github.io",
  "app",
  "vercel.app",
]);

function probedDomains(): { probe: CookieDomainProbe; probed: string[] } {
  const probed: string[] = [];
  return {
    probed,
    probe: (domain: string): boolean => {
      probed.push(domain);
      return !PUBLIC_SUFFIXES.has(domain);
    },
  };
}

const acceptsPublicSuffixListDomains: CookieDomainProbe = (domain) =>
  !PUBLIC_SUFFIXES.has(domain);

const https = (hostname: string) => ({ protocol: "https:", hostname });

describe("findRegistrableDomain", () => {
  test("is the shortest suffix the browser accepts as a cookie domain", () => {
    const { probe, probed } = probedDomains();
    expect(findRegistrableDomain("lorahworld.jalexw.ca", probe)).toBe("jalexw.ca");
    expect(probed).toEqual(["jalexw.ca"]);
  });

  test("skips multi-label public suffixes", () => {
    expect(findRegistrableDomain("a.b.example.co.uk", acceptsPublicSuffixListDomains)).toBe(
      "example.co.uk",
    );
    expect(findRegistrableDomain("me.github.io", acceptsPublicSuffixListDomains)).toBe(
      "me.github.io",
    );
  });

  test("is null for hosts without one, or when no cookie sticks", () => {
    const { probe, probed } = probedDomains();
    expect(findRegistrableDomain("localhost", probe)).toBeNull();
    expect(findRegistrableDomain("127.0.0.1", probe)).toBeNull();
    expect(findRegistrableDomain("[::1]", probe)).toBeNull();
    expect(probed).toEqual([]);
    expect(findRegistrableDomain("app.example.com", () => false)).toBeNull();
  });
});

describe("isSameSiteAsAuthServer", () => {
  test("a client app on another site than the auth server is cross-site", () => {
    expect(
      isSameSiteAsAuthServer(
        https("lorahworld.jalexw.ca"),
        "https://auth.schemavaults.com",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(false);
  });

  test("a client app on a sibling subdomain of the auth server is same-site", () => {
    expect(
      isSameSiteAsAuthServer(
        https("app.schemavaults.com"),
        "https://auth.schemavaults.com",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(true);
    expect(
      isSameSiteAsAuthServer(
        https("schemavaults.com"),
        "https://auth.schemavaults.com/",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(true);
    expect(
      isSameSiteAsAuthServer(
        https("shop.example.co.uk"),
        "https://login.example.co.uk",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(true);
  });

  test("hosts under a shared public suffix are different sites", () => {
    expect(
      isSameSiteAsAuthServer(
        https("my-game.vercel.app"),
        "https://my-auth.vercel.app",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(false);
    expect(
      isSameSiteAsAuthServer(
        https("a.example.co.uk"),
        "https://auth.other.co.uk",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(false);
  });

  test("the same host is same-site whatever the port; another scheme is not", () => {
    expect(
      isSameSiteAsAuthServer(
        https("auth.schemavaults.com"),
        "https://auth.schemavaults.com:8443",
        () => false,
      ),
    ).toBe(true);
    expect(
      isSameSiteAsAuthServer(
        { protocol: "http:", hostname: "app.schemavaults.com" },
        "https://auth.schemavaults.com",
        acceptsPublicSuffixListDomains,
      ),
    ).toBe(false);
  });

  test("errs towards cross-site when it cannot tell", () => {
    expect(
      isSameSiteAsAuthServer(
        https("app.schemavaults.com"),
        "https://auth.schemavaults.com",
        () => false,
      ),
    ).toBe(false);
    expect(
      isSameSiteAsAuthServer(https("app.schemavaults.com"), "not a url", acceptsPublicSuffixListDomains),
    ).toBe(false);
  });
});
