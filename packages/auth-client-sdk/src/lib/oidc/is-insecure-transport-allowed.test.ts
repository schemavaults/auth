import { describe, expect, test } from "bun:test";
import { isInsecureTransportAllowed } from "./is-insecure-transport-allowed";

describe("isInsecureTransportAllowed", () => {
  test("only development and test may use cleartext HTTP", () => {
    expect(isInsecureTransportAllowed("development")).toBe(true);
    expect(isInsecureTransportAllowed("test")).toBe(true);
    expect(isInsecureTransportAllowed("staging")).toBe(false);
    expect(isInsecureTransportAllowed("production")).toBe(false);
  });
});
