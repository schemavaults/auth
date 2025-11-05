import { test, expect, describe } from "bun:test";

import { parseNavigationPath } from "./parse-navigation-path";

describe("Navigation Path Parsing", () => {
  test("root path is parsed as empty array", () => {
    expect(parseNavigationPath("/")).toEqual([]);
    expect(parseNavigationPath("")).toEqual([]);
  });

  test("path with no leading slash is parsed correctly", () => {
    expect(parseNavigationPath("vaults/my-vault")).toEqual([
      "vaults",
      "my-vault",
    ]);
  });

  test("path with leading slash is parsed correctly", () => {
    expect(parseNavigationPath("/vaults/my-vault")).toEqual([
      "vaults",
      "my-vault",
    ]);
  });

  test("path with trailing slash is parsed correctly", () => {
    expect(parseNavigationPath("vaults/my-vault/")).toEqual([
      "vaults",
      "my-vault",
    ]);
  });

  test("path with leading and trailing slash is parsed correctly", () => {
    expect(parseNavigationPath("/vaults/my-vault/")).toEqual([
      "vaults",
      "my-vault",
    ]);
  });

  test("login route is parsed correctly", () => {
    expect(parseNavigationPath("/auth/login")).toEqual(["auth", "login"]);
  });

  test("routes with search params are parsed correctly", () => {
    expect(
      parseNavigationPath(
        "/auth/login?auth_flow=pkce&code_challenge=abcdefg123",
      ),
    ).toEqual(["auth", "login"]);

    expect(parseNavigationPath("/trpc?input=abcdefg123")).toEqual(["trpc"]);
  });

  test("routes with search params that contain a question mark are parsed properly", () => {
    expect(
      parseNavigationPath("/path_with_weird_search_params?input=hello_world?"),
    ).toEqual(["path_with_weird_search_params"]);

    expect(
      parseNavigationPath(
        "/path_with_weird_search_params/idk_yolo?input=hello_world?&wagwan=pham",
      ),
    ).toEqual(["path_with_weird_search_params", "idk_yolo"]);
  });
});
