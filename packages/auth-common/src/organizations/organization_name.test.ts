import { describe, test, expect } from "bun:test";
import { isValidOrganizationName } from "./organization_name";

describe("Organization Names", () => {
  test("Organization names may contain alphanumeric characters", () => {
    expect(isValidOrganizationName("Acme")).toBeTruthy();
    expect(isValidOrganizationName("Acme123")).toBeTruthy();
  });

  test("Organization names may contain spaces, hyphens, and underscores in the middle", () => {
    expect(isValidOrganizationName("Acme Corp")).toBeTruthy();
    expect(isValidOrganizationName("Acme-Corp")).toBeTruthy();
    expect(isValidOrganizationName("Acme_Corp")).toBeTruthy();
    expect(isValidOrganizationName("Acme Corp_123-X")).toBeTruthy();
  });

  test("Organization names may not start with a hyphen, underscore, or space", () => {
    expect(isValidOrganizationName(" Acme")).toBeFalsy();
    expect(isValidOrganizationName("-Acme")).toBeFalsy();
    expect(isValidOrganizationName("_Acme")).toBeFalsy();
  });

  test("Organization names may not end with a hyphen, underscore, or space", () => {
    expect(isValidOrganizationName("Acme ")).toBeFalsy();
    expect(isValidOrganizationName("Acme-")).toBeFalsy();
    expect(isValidOrganizationName("Acme_")).toBeFalsy();
  });

  test("Organization names may not contain disallowed characters", () => {
    expect(isValidOrganizationName("Acme!")).toBeFalsy();
    expect(isValidOrganizationName("Acme@Corp")).toBeFalsy();
    expect(isValidOrganizationName("Acme/Corp")).toBeFalsy();
    expect(isValidOrganizationName("Acme.Corp")).toBeFalsy();
  });

  test("Single alphanumeric character is a valid organization name", () => {
    expect(isValidOrganizationName("A")).toBeTruthy();
    expect(isValidOrganizationName("7")).toBeTruthy();
  });

  test("Empty string is not a valid organization name", () => {
    expect(isValidOrganizationName("")).toBeFalsy();
  });
});
