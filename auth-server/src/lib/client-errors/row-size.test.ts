import { describe, expect, test } from "bun:test";
import {
  CLIENT_ERROR_ROW_FIXED_BYTES,
  type ClientErrorRowContents,
  estimateClientErrorRowBytes,
} from "./row-size";

const empty: ClientErrorRowContents = {
  client_app_id: "",
  name: "",
  message: "",
  stack: null,
  operation: null,
  sdk_name: null,
  sdk_version: null,
  app_env: null,
  page_url: null,
  origin: null,
  user_agent: null,
  reported_uid: null,
  context: null,
};

describe("estimateClientErrorRowBytes", () => {
  test("is the fixed allowance for an empty row", () => {
    expect(estimateClientErrorRowBytes(empty)).toBe(CLIENT_ERROR_ROW_FIXED_BYTES);
  });

  test("counts UTF-8 bytes of every text column and the serialized context", () => {
    const row: ClientErrorRowContents = {
      ...empty,
      client_app_id: "app", // 3
      name: "Error", // 5
      message: "héllo", // 6 (é is 2 bytes)
      stack: "s".repeat(100), // 100
      user_agent: "UA", // 2
      context: { a: 1 }, // {"a":1} = 7
    };
    expect(estimateClientErrorRowBytes(row)).toBe(CLIENT_ERROR_ROW_FIXED_BYTES + 3 + 5 + 6 + 100 + 2 + 7);
  });
});
