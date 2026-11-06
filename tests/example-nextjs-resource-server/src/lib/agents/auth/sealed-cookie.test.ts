import { describe, expect, test } from "bun:test";
import {
  SEALED_COOKIE_CHUNK_SIZE,
  clearChunkedCookie,
  readChunkedCookie,
  sealValue,
  unsealValue,
  writeChunkedCookie,
  type CookieJar,
  type CookieOptions,
} from "./sealed-cookie";

const SECRET = "svs_test-confidential-client-secret";
const PURPOSE = "agents sign-in";
const OPTIONS: CookieOptions = { httpOnly: true, sameSite: "lax", secure: true, path: "/agents", maxAge: 60 };

/** Cookies as a browser keeps them: what was set, and expired ones gone. */
class TestJar implements CookieJar {
  readonly values = new Map<string, string>();
  readonly options = new Map<string, CookieOptions>();

  get(name: string): { value: string } | undefined {
    const value = this.values.get(name);
    return value === undefined ? undefined : { value };
  }

  set(name: string, value: string, options: CookieOptions): void {
    this.options.set(name, options);
    if (options.maxAge === 0) this.values.delete(name);
    else this.values.set(name, value);
  }
}

describe("sealValue / unsealValue", () => {
  test("round-trips a value the browser can't read", async () => {
    const value = { access_token: "the-users-access-token", expires_at: 1234 };
    const sealed = await sealValue(SECRET, PURPOSE, value);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("the-users-access-token");
    expect(atob(sealed.slice(3).replaceAll("-", "+").replaceAll("_", "/"))).not.toContain("access_token");
    expect(await unsealValue(SECRET, PURPOSE, sealed)).toEqual(value);
  });

  test("seals the same value differently each time", async () => {
    expect(await sealValue(SECRET, PURPOSE, "same")).not.toBe(await sealValue(SECRET, PURPOSE, "same"));
  });

  test("opens nothing altered, sealed for another purpose or with another secret, or malformed", async () => {
    const sealed = await sealValue(SECRET, PURPOSE, { sub: "user" });
    const payload = sealed.slice("v1.".length);
    const altered = `v1.${payload.slice(0, 20)}${payload[20] === "A" ? "B" : "A"}${payload.slice(21)}`;

    expect(await unsealValue(SECRET, PURPOSE, altered)).toBeNull();
    expect(await unsealValue(SECRET, "another purpose", sealed)).toBeNull();
    expect(await unsealValue("another-secret", PURPOSE, sealed)).toBeNull();
    expect(await unsealValue(SECRET, PURPOSE, `v2.${payload}`)).toBeNull();
    expect(await unsealValue(SECRET, PURPOSE, payload)).toBeNull();
    expect(await unsealValue(SECRET, PURPOSE, "v1.not base64!")).toBeNull();
    expect(await unsealValue(SECRET, PURPOSE, "v1.")).toBeNull();
  });
});

describe("chunked cookies", () => {
  test("split a long value across numbered cookies and join it back", () => {
    const jar = new TestJar();
    const value = "x".repeat(SEALED_COOKIE_CHUNK_SIZE * 2 + 5);
    writeChunkedCookie(jar, "sign_in", value, OPTIONS);

    expect([...jar.values.keys()].sort()).toEqual(["sign_in.0", "sign_in.1", "sign_in.2"]);
    expect(jar.values.get("sign_in.2")).toHaveLength(5);
    expect(jar.options.get("sign_in.0")).toEqual(OPTIONS);
    expect(readChunkedCookie(jar, "sign_in")).toBe(value);
  });

  test("expire the chunks a longer value left behind", () => {
    const request = new TestJar();
    writeChunkedCookie(request, "sign_in", "x".repeat(SEALED_COOKIE_CHUNK_SIZE * 2 + 1), OPTIONS);

    const response = new TestJar();
    writeChunkedCookie(response, "sign_in", "short", OPTIONS, request);
    expect(response.values.get("sign_in.0")).toBe("short");
    expect(response.options.get("sign_in.1")?.maxAge).toBe(0);
    expect(response.options.get("sign_in.2")?.maxAge).toBe(0);
    expect(response.options.has("sign_in.3")).toBe(false);
  });

  test("read nothing when there are none, and clear every chunk", () => {
    const jar = new TestJar();
    expect(readChunkedCookie(jar, "sign_in")).toBeNull();

    writeChunkedCookie(jar, "sign_in", "x".repeat(SEALED_COOKIE_CHUNK_SIZE + 1), OPTIONS);
    clearChunkedCookie(jar, "sign_in", OPTIONS);
    expect(readChunkedCookie(jar, "sign_in")).toBeNull();
    expect(jar.options.get("sign_in.0")).toEqual({ ...OPTIONS, maxAge: 0 });
  });

  test("refuse a value too large for the cookies they may use", () => {
    expect(() =>
      writeChunkedCookie(new TestJar(), "sign_in", "x".repeat(SEALED_COOKIE_CHUNK_SIZE * 6 + 1), OPTIONS),
    ).toThrow("too large");
  });

  test("hold a sealed sign-in (an access and a refresh token) in two cookies", async () => {
    const jar = new TestJar();
    const signIn = {
      sub: "00000000-0000-0000-0000-000000000000|7d6f4a3e-9c1b-4f7e-8a2d-5b3c1e0f9a8b",
      email: "someone.with.a.long.address@example.com",
      scope: "openid email example:notes.read",
      access_token: "a".repeat(2600),
      access_token_expires_at: Date.now(),
      refresh_token: "r".repeat(2600),
    };
    writeChunkedCookie(jar, "sign_in", await sealValue(SECRET, PURPOSE, signIn), OPTIONS);

    expect(jar.values.size).toBe(2);
    expect(await unsealValue(SECRET, PURPOSE, readChunkedCookie(jar, "sign_in") ?? "")).toEqual(signIn);
  });
});
