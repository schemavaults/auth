import { describe, expect, test } from "bun:test";
import { z } from "zod";
import createBaseIdSchema from "./base-id-schema";

const baseIdSchema = createBaseIdSchema(z);

function isValidBaseId(
  val: unknown,
  log?: (data: unknown) => void,
): val is z.infer<typeof baseIdSchema> {
  const parsed = baseIdSchema.safeParse(val);
  if (!parsed.success && typeof log === "function") {
    log(parsed.error);
    log(parsed.error?.cause);
    log(parsed.error?.errors);
  }
  return parsed.success;
}

const EXAMPLE_VALID_BASE_IDS = [
  "hello",
  "my_new_api_server",
  "my-new-app",
  "schemavaults-auth",
  "schemavaults-web",
  "we_are_gr8",
] as const;

describe("Base ID Schema", () => {
  test("empty string is not valid", () => {
    expect(isValidBaseId("")).toBeFalse();
  });

  test("may not end with an underscore", () => {
    expect(isValidBaseId("hello_")).toBeFalse();
  });

  test("may not start with an underscore", () => {
    expect(isValidBaseId("_hello")).toBeFalse();
  });

  test("may not end with a hyphen", () => {
    expect(isValidBaseId("hello-")).toBeFalse();
  });

  test("may not start with a hyphen", () => {
    expect(isValidBaseId("-hello")).toBeFalse();
  });

  test("reasonable valid ID examples are treated as valid", () => {
    for (const baseIdExample of EXAMPLE_VALID_BASE_IDS) {
      expect(isValidBaseId(baseIdExample)).toBeTrue();
    }
  });

  test("uuids are treated as valid", () => {
    for (let i = 0; i < 10; i++) {
      expect(isValidBaseId(crypto.randomUUID(), console.warn)).toBeTrue();
    }
  });
});
