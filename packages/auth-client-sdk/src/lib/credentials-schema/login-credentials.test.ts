import { describe, test, expect } from "bun:test";
import credentialsSchema from "./credentials-schema";
import type { Credentials } from "@/types/credentials";

describe("Login Credentials", () => {
  test("empty password is not valid", () => {
    const exampleCredentials: Credentials = {
      email: "support@schemavaults.com",
      password: "",
    };

    expect(credentialsSchema.safeParse(exampleCredentials).success).toBeFalse();
  });

  test("parses valid login credentials successfully", () => {
    const exampleCredentials: Credentials = {
      email: "support@schemavaults.com",
      password: "myPassword123!",
    };

    expect(credentialsSchema.safeParse(exampleCredentials).success).toBeTrue();
  });
});
