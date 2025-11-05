import { describe, test, expect } from "bun:test";
import credentialsSchema from "./credentials-schema";
import type { Credentials } from "@/types/credentials";

describe("Register Credentials", () => {
  test("empty password is not valid", () => {
    const exampleCredentials: Credentials = {
      email: "support@schemavaults.com",
      password: "",
      confirm: "",
      invite_code: "",
    };

    expect(credentialsSchema.safeParse(exampleCredentials).success).toBeFalse();
  });

  test("mismatched password is not valid", () => {
    const exampleCredentials: Credentials = {
      email: "support@schemavaults.com",
      password: "myPassword123!",
      confirm: "MyPassword456$",
      invite_code: "MY_INVITE_CODE_123",
    };

    expect(credentialsSchema.safeParse(exampleCredentials).success).toBeFalse();
  });

  test("parses valid registration credentials successfully", () => {
    const exampleCredentials: Credentials = {
      email: "support@schemavaults.com",
      password: "myPassword123!",
      confirm: "myPassword123!",
      invite_code: "MY_INVITE_CODE_123",
    };

    expect(credentialsSchema.safeParse(exampleCredentials).success).toBeTrue();
  });
});
