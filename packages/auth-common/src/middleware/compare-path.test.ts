import { test, expect, describe } from "bun:test";

import { parseNavigationPath } from "./parse-navigation-path";
import { comparePath } from "./compare-path";

describe("Path Comparison", () => {
  test("empty path matches empty route", () => {
    expect(comparePath(parseNavigationPath("/"), [])).toBe(true);
    expect(comparePath(parseNavigationPath(""), [])).toBe(true);
  });

  test("empty path does not match non-empty route", () => {
    expect(comparePath(parseNavigationPath("/"), ["vaults"])).toBe(false);
    expect(comparePath(parseNavigationPath(""), ["auth", "login"])).toBe(false);
  });

  test("non-empty path matches exact non-empty path", () => {
    expect(comparePath(parseNavigationPath("/vaults"), ["vaults"])).toBe(true);
    expect(
      comparePath(parseNavigationPath("/vaults/my-vault"), [
        "vaults",
        "my-vault",
      ]),
    ).toBe(true);
    expect(
      comparePath(parseNavigationPath("/vaults/my-vault/"), [
        "vaults",
        "my-vault",
      ]),
    ).toBe(true);
    expect(
      comparePath(parseNavigationPath("/auth/login"), ["auth", "login"]),
    ).toBe(true);
  });

  test("non-empty path is not matched by empty route", () => {
    expect(comparePath(parseNavigationPath("/vaults"), [])).toBe(false);
    expect(comparePath(parseNavigationPath("/vaults/my-vault"), [])).toBe(
      false,
    );
    expect(comparePath(parseNavigationPath("/vaults/my-vault/"), [])).toBe(
      false,
    );
    expect(comparePath(parseNavigationPath("/auth/login"), [])).toBe(false);
  });
});
