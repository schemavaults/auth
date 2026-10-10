import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  DEFAULT_EMAIL_ACCENT_COLOR,
  getAuthServerEmailAccentColor,
  isInlineCssColor,
} from "./email-accent-color";

const ORIGINAL_THEME_COLOR_1: string | undefined = process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1;

afterEach(() => {
  if (ORIGINAL_THEME_COLOR_1 === undefined) {
    delete process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1;
  } else {
    process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 = ORIGINAL_THEME_COLOR_1;
  }
});

describe("isInlineCssColor", () => {
  test("accepts hex colors, named colors and color functions", () => {
    for (const color of ["#7c3aed", "#fff", "#7c3aedcc", "rebeccapurple", "rgb(124 58 237)", "rgba(124, 58, 237, 0.8)", "hsl(262deg 83% 58%)", "oklch(54% 0.25 293)"]) {
      expect(isInlineCssColor(color)).toBeTrue();
    }
  });

  test("rejects CSS variables and values that would break out of a style attribute", () => {
    for (const color of ["var(--my-color)", "rgb(var(--r) 0 0)", "#7c3aed;background:red", 'red" onclick="x', "#12345", ""]) {
      expect(isInlineCssColor(color)).toBeFalse();
    }
  });
});

describe("getAuthServerEmailAccentColor", () => {
  test("is the default brand blue's literal value when SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 is unset", () => {
    delete process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1;
    expect(getAuthServerEmailAccentColor()).toBe(DEFAULT_EMAIL_ACCENT_COLOR);
    expect(DEFAULT_EMAIL_ACCENT_COLOR).toStartWith("#");
  });

  test("is the deployment's first theme color", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 = '"#7c3aed"';
    expect(getAuthServerEmailAccentColor()).toBe("#7c3aed");
  });

  test("falls back to the default, with a warning, for a color email clients cannot render", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 = "var(--acme-primary)";
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(getAuthServerEmailAccentColor()).toBe(DEFAULT_EMAIL_ACCENT_COLOR);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1");
    } finally {
      warn.mockRestore();
    }
  });
});
