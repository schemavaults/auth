import { describe, expect, test } from "bun:test";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  test("shows counts below 1 KiB in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(-5)).toBe("0 B");
  });

  test("uses one decimal below 10 of a unit and whole numbers above", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(5172)).toBe("5.1 KB");
    expect(formatBytes(812 * 1024)).toBe("812 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatBytes(100 * 1024 * 1024)).toBe("100 MB");
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
  });

  test("drops a trailing .0", () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
    expect(formatBytes(9.96 * 1024)).toBe("10 KB");
  });

  test("stops at terabytes", () => {
    expect(formatBytes(2048 * 1024 ** 4)).toBe("2048 TB");
  });
});
