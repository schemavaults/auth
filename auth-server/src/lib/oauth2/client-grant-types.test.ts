import { describe, expect, test } from "bun:test";
import {
  isGrantTypeAllowedForClientApp,
  type ClientAppGrantTypePolicyFields,
  type TokenEndpointGrantType,
} from "./client-grant-types";

const ALL_GRANTS: readonly TokenEndpointGrantType[] = [
  "authorization_code",
  "refresh_token",
  "client_credentials",
];

const ORGANIZATION_APP: ClientAppGrantTypePolicyFields = {
  owner_type: "organization",
  owner_organization_id: "org_1",
  owner_uid: null,
  grant_types: null,
};

function dynamicClient(
  grant_types: ClientAppGrantTypePolicyFields["grant_types"],
): ClientAppGrantTypePolicyFields {
  return {
    owner_type: "dynamic-client-registration",
    owner_organization_id: null,
    owner_uid: null,
    grant_types,
  };
}

describe("isGrantTypeAllowedForClientApp", () => {
  test("apps without registered grant types may use every grant", () => {
    for (const grant_type of ALL_GRANTS) {
      expect(isGrantTypeAllowedForClientApp(ORGANIZATION_APP, grant_type)).toBe(
        true,
      );
      expect(
        isGrantTypeAllowedForClientApp(
          { ...ORGANIZATION_APP, grant_types: undefined },
          grant_type,
        ),
      ).toBe(true);
    }
    expect(
      isGrantTypeAllowedForClientApp(
        {
          owner_type: "user",
          owner_organization_id: null,
          owner_uid: "6f1c1d0e-8a39-4a8e-9b1a-3f5f1b0f2a11",
        },
        "client_credentials",
      ),
    ).toBe(true);
  });

  test("dynamically registered clients may never use the client_credentials grant", () => {
    expect(
      isGrantTypeAllowedForClientApp(
        dynamicClient(["authorization_code", "refresh_token"]),
        "client_credentials",
      ),
    ).toBe(false);
    // Not even when the stored metadata is missing or claims otherwise.
    expect(
      isGrantTypeAllowedForClientApp(dynamicClient(null), "client_credentials"),
    ).toBe(false);
    expect(
      isGrantTypeAllowedForClientApp(
        dynamicClient([
          "client_credentials",
        ] as unknown as ClientAppGrantTypePolicyFields["grant_types"]),
        "client_credentials",
      ),
    ).toBe(false);
  });

  test("registered grant types are enforced", () => {
    const client = dynamicClient(["authorization_code", "refresh_token"]);
    expect(isGrantTypeAllowedForClientApp(client, "authorization_code")).toBe(
      true,
    );
    expect(isGrantTypeAllowedForClientApp(client, "refresh_token")).toBe(true);

    // A grant outside the registered list is refused (managed apps with
    // stored metadata are held to it too).
    expect(
      isGrantTypeAllowedForClientApp(
        {
          ...ORGANIZATION_APP,
          grant_types: ["refresh_token"],
        },
        "authorization_code",
      ),
    ).toBe(false);
    expect(
      isGrantTypeAllowedForClientApp(
        { ...ORGANIZATION_APP, grant_types: ["authorization_code"] },
        "client_credentials",
      ),
    ).toBe(false);
    expect(
      isGrantTypeAllowedForClientApp(
        { ...ORGANIZATION_APP, grant_types: [] },
        "authorization_code",
      ),
    ).toBe(false);
  });

  test("refresh_token is implied by authorization_code (the RFC 7591 default registration)", () => {
    expect(
      isGrantTypeAllowedForClientApp(
        dynamicClient(["authorization_code"]),
        "refresh_token",
      ),
    ).toBe(true);
  });
});
