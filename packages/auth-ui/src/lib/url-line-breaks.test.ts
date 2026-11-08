import { describe, expect, test } from "bun:test";
import { splitUrlAtLineBreaks } from "./url-line-breaks";

describe("splitUrlAtLineBreaks", () => {
  test("wraps after the scheme, before dots and before slashes", () => {
    expect(
      splitUrlAtLineBreaks("https://golfandgrill.schemavaults.com/auth/callback"),
    ).toEqual([
      "https://",
      "golfandgrill",
      ".schemavaults",
      ".com",
      "/auth",
      "/callback",
    ]);
  });

  test("wraps before hyphens and underscores in a path", () => {
    expect(
      splitUrlAtLineBreaks("https://app.example.com/openid-client_confidential/cb"),
    ).toEqual([
      "https://",
      "app",
      ".example",
      ".com",
      "/openid",
      "-client",
      "_confidential",
      "/cb",
    ]);
  });

  test("wraps before the query and fragment, around = and &", () => {
    expect(splitUrlAtLineBreaks("https://a.io/cb?x=1&y=2#top")).toEqual([
      "https://",
      "a",
      ".io",
      "/cb",
      "?x",
      "=",
      "1",
      "&",
      "y",
      "=",
      "2",
      "#top",
    ]);
  });

  test("keeps the port with its host and loopback paths intact", () => {
    expect(splitUrlAtLineBreaks("http://localhost:3000/callback")).toEqual([
      "http://",
      "localhost:3000",
      "/callback",
    ]);
  });

  test("keeps a private-use scheme's single slash with its colon", () => {
    expect(splitUrlAtLineBreaks("com.example.app:/oauth2redirect")).toEqual([
      "com",
      ".example",
      ".app:/oauth2redirect",
    ]);
  });

  test("the pieces always join back into the URL", () => {
    for (const url of [
      "",
      "/",
      "//",
      "https://",
      "https://example.com//double//slashes/",
      "https://example.com/?next=https://other.example/path",
      "...--__&&==",
    ]) {
      expect(splitUrlAtLineBreaks(url).join("")).toBe(url);
      expect(splitUrlAtLineBreaks(url).every((piece) => piece.length > 0)).toBe(
        true,
      );
    }
  });
});
