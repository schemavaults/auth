import { describe, expect, test } from "bun:test";
import {
  DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS,
  USER_CODE_ALPHABET,
  USER_CODE_LENGTH,
  deviceAuthorizationResponseSchema,
  formatUserCode,
  generateUserCode,
  getDeviceVerificationUri,
  getDeviceVerificationUriComplete,
  isDeviceAccessTokenError,
  isNormalizedUserCode,
  normalizeUserCode,
} from "./index";

describe("generateUserCode", () => {
  test("produces normalized codes over the base-20 alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUserCode();
      expect(code).toHaveLength(USER_CODE_LENGTH);
      expect(isNormalizedUserCode(code)).toBe(true);
      for (const char of code) {
        expect(USER_CODE_ALPHABET).toContain(char);
      }
    }
  });

  test("discards bytes that would bias the distribution", () => {
    // 240..255 are rejected (240 = 12 * 20); 0 -> 'B', 19 -> 'Z', 20 -> 'B'.
    const batches: number[][] = [
      [255, 240, 0, 19, 20, 250, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ];
    const code = generateUserCode((bytes) => {
      bytes.set(batches.shift() ?? []);
      return bytes;
    });
    expect(code).toBe("BZBCDFGH");
  });

  test("draws more random bytes until the code is complete", () => {
    let calls = 0;
    const code = generateUserCode((bytes) => {
      calls += 1;
      // The first batch is all rejected; the second fills the code.
      bytes.fill(calls === 1 ? 255 : 3);
      return bytes;
    });
    expect(calls).toBe(2);
    expect(code).toBe("FFFFFFFF");
  });
});

describe("normalizeUserCode", () => {
  test("accepts the displayed form, lower case, and stray spaces", () => {
    expect(normalizeUserCode("BCDF-GHJK")).toBe("BCDFGHJK");
    expect(normalizeUserCode("bcdf-ghjk")).toBe("BCDFGHJK");
    expect(normalizeUserCode(" bcdf ghjk ")).toBe("BCDFGHJK");
    expect(normalizeUserCode("BCDFGHJK")).toBe("BCDFGHJK");
  });

  test("refuses codes of the wrong length or with characters outside the alphabet", () => {
    expect(normalizeUserCode("BCDF-GHJ")).toBeNull();
    expect(normalizeUserCode("BCDF-GHJKL")).toBeNull();
    // Vowels and digits are not in the alphabet.
    expect(normalizeUserCode("ABCD-EFGH")).toBeNull();
    expect(normalizeUserCode("BCDF-GHJ1")).toBeNull();
    expect(normalizeUserCode("")).toBeNull();
    expect(normalizeUserCode(undefined)).toBeNull();
    expect(normalizeUserCode(12345678)).toBeNull();
    expect(normalizeUserCode(`BCDF-GHJK${" ".repeat(40)}`)).toBeNull();
  });
});

describe("formatUserCode", () => {
  test("groups a user code in fours", () => {
    expect(formatUserCode("BCDFGHJK")).toBe("BCDF-GHJK");
    expect(formatUserCode("bcdf ghjk")).toBe("BCDF-GHJK");
  });

  test("leaves anything else as it was", () => {
    expect(formatUserCode("not a code")).toBe("not a code");
  });
});

describe("verification URIs", () => {
  test("point at the auth server's /device page", () => {
    expect(getDeviceVerificationUri("https://auth.example.com")).toBe(
      "https://auth.example.com/device",
    );
    expect(getDeviceVerificationUri("https://auth.example.com/")).toBe(
      "https://auth.example.com/device",
    );
  });

  test("carry the display form of the user code", () => {
    expect(
      getDeviceVerificationUriComplete("https://auth.example.com", "BCDFGHJK"),
    ).toBe("https://auth.example.com/device?user_code=BCDF-GHJK");
  });

  test("refuse an empty issuer", () => {
    expect(() => getDeviceVerificationUri("")).toThrow(TypeError);
  });
});

describe("deviceAuthorizationResponseSchema", () => {
  const response = {
    device_code: "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
    user_code: "BCDF-GHJK",
    verification_uri: "https://auth.example.com/device",
    verification_uri_complete: "https://auth.example.com/device?user_code=BCDF-GHJK",
    expires_in: 900,
    interval: 5,
  };

  test("parses the RFC 8628 §3.2 response", () => {
    expect(deviceAuthorizationResponseSchema.parse(response)).toEqual(response);
  });

  test("defaults the interval to 5 seconds and keeps unknown fields", () => {
    const without_interval: Record<string, unknown> = { ...response, extra: "kept" };
    delete without_interval.interval;
    const parsed = deviceAuthorizationResponseSchema.parse(without_interval);
    expect(parsed.interval).toBe(DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS);
    expect((parsed as Record<string, unknown>).extra).toBe("kept");
  });

  test("refuses a response without a device code", () => {
    const without_device_code: Record<string, unknown> = { ...response };
    delete without_device_code.device_code;
    expect(
      deviceAuthorizationResponseSchema.safeParse(without_device_code).success,
    ).toBe(false);
  });
});

describe("isDeviceAccessTokenError", () => {
  test("recognizes the RFC 8628 §3.5 codes only", () => {
    for (const code of ["authorization_pending", "slow_down", "access_denied", "expired_token"]) {
      expect(isDeviceAccessTokenError(code)).toBe(true);
    }
    expect(isDeviceAccessTokenError("invalid_grant")).toBe(false);
    expect(isDeviceAccessTokenError(null)).toBe(false);
  });
});
