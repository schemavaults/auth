import { describe, test, expect } from "bun:test";
import {
  assignMemberFormSchema,
  assignableOrganizationMembershipRoleSchema,
} from "./assign_member_form";

const UID = "0a5c1f0e-4d0b-4d8e-9a57-2b4f3c9a1e11";

describe("assignMemberFormSchema", () => {
  test("accepts an e-mail address or a user id with an assignable role", () => {
    expect(
      assignMemberFormSchema.safeParse({
        organization_id: "acme-inc",
        input_mode: "email",
        identifier: "teammate@example.com",
        role: "member",
      }).success,
    ).toBeTrue();
    expect(
      assignMemberFormSchema.safeParse({
        organization_id: "acme-inc",
        input_mode: "uid",
        identifier: UID,
        role: "owner",
      }).success,
    ).toBeTrue();
  });

  test("checks the identifier against the input mode", () => {
    const emailAsUid = assignMemberFormSchema.safeParse({
      organization_id: "acme-inc",
      input_mode: "uid",
      identifier: "teammate@example.com",
      role: "member",
    });
    expect(emailAsUid.success).toBeFalse();
    expect(emailAsUid.error?.issues[0]?.path).toEqual(["identifier"]);

    expect(
      assignMemberFormSchema.safeParse({
        organization_id: "acme-inc",
        input_mode: "email",
        identifier: UID,
        role: "member",
      }).success,
    ).toBeFalse();
    expect(
      assignMemberFormSchema.safeParse({
        organization_id: "acme-inc",
        input_mode: "email",
        identifier: "",
        role: "member",
      }).success,
    ).toBeFalse();
  });

  test("never assigns the virtual admin role", () => {
    expect(assignableOrganizationMembershipRoleSchema.safeParse("admin").success).toBeFalse();
    expect(
      assignMemberFormSchema.safeParse({
        organization_id: "acme-inc",
        input_mode: "uid",
        identifier: UID,
        role: "admin",
      }).success,
    ).toBeFalse();
  });
});
