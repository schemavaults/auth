import { describe, test, expect } from "bun:test";
import { isValidOrganizationID } from "./organization_id";

describe("Organization IDs", () => {
  test("Organization IDs must be lowercase", () => {
    expect(isValidOrganizationID("UPPERCASE_ID")).toBeFalsy();
  });

  test("Organization IDs may contain hyphens but not at the end", () => {
    expect(isValidOrganizationID("my-corporation")).toBeTruthy();
    expect(isValidOrganizationID("blahblah---")).toBeFalsy();
  });

  test("Organization IDs may contain underscores but not at the end", () => {
    expect(isValidOrganizationID("my_corporation")).toBeTruthy();
    expect(isValidOrganizationID("blahblah___")).toBeFalsy();
  });

  test("Organization IDs must start with a letter", () => {
    expect(isValidOrganizationID("hello_world_org")).toBeTruthy();
    expect(isValidOrganizationID("8008s_hello")).toBeFalsy();
  });
});
