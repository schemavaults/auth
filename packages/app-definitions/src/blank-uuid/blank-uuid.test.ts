import { describe, expect, test } from "bun:test";
import blankUuid from "./blank-uuid";
import { z } from "zod";
import { isValidAppId } from "@/app-id";
import { isValidApiServerId } from "@/api-server-id";

const uuidSchema = z.string().uuid();

describe("Blank UUID", () => {
  test("is parsed as valid by zod schema", () => {
    expect(uuidSchema.safeParse(blankUuid).success).toBeTrue();
  });

  test("is parsed as valid by app ID schema", () => {
    expect(isValidAppId(blankUuid)).toBeTrue();
  });

  test("is parsed as valid by API server ID schema", () => {
    expect(isValidApiServerId(blankUuid)).toBeTrue();
  });
});
