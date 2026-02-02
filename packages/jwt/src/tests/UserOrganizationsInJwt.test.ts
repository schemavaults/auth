import { describe, expect, it } from "bun:test";
import MockUser from "./MockUser";
import { generateJWT } from "@/jwt/generate";
import { SCHEMAVAULTS_CLI } from "@schemavaults/app-definitions";
import { generateNewJwtKeySet } from "@/jwt/jwt_keys";
import { decodeJWT } from "@/jwt/decode";
import type { AccessToken } from "@schemavaults/auth-common";
import {
  MAXIMUM_USER_ORGANIZATIONS,
  MAXIMUM_ORGANIZATION_ID_LENGTH,
  MaximumBrowserCookieSize,
} from "@schemavaults/auth-common";

const user = new MockUser();

describe("UserOrganizationsInJwt", () => {
  it("should return the user's organizations", async () => {
    const audience = crypto.randomUUID();
    const audience_id: string = audience;
    const jwt_keys = await generateNewJwtKeySet({
      audience_id,
    });

    const jwt: AccessToken = await generateJWT({
      type: "access",
      audience,
      iat: Date.now(),
      user,
      client_app_id: SCHEMAVAULTS_CLI.app_id,
      jwt_keys,
      env: "test",
      orgs: ["org1", "org2"],
    });
    const decoded = await decodeJWT({
      audience,
      jwt_keys,
      jwt: jwt.token,
      env: "test",
      type: "access",
    });
    expect(decoded.orgs).toBeArrayOfSize(2);
    expect(decoded.orgs).toContain("org1");
    expect(decoded.orgs).toContain("org2");
  });

  it("should generate a token smaller than MaximumBrowserCookieSize with maximum organizations", async () => {
    // Generate unique organization IDs at maximum length
    const maxLengthOrgIds: string[] = [];
    const paddingChars = "abcdefghijklmnopqrstuvwxyz";
    expect(paddingChars.length).toBeGreaterThan(MAXIMUM_USER_ORGANIZATIONS); // need enough different padding characters to have a different one for each org
    for (let i = 0; i < MAXIMUM_USER_ORGANIZATIONS; i++) {
      // Create a max-length org ID using unique padding character for each
      // Format: "org-X-" + unique padding to reach MAXIMUM_ORGANIZATION_ID_LENGTH
      const prefix = `org-${i}-`;
      const paddingLength = MAXIMUM_ORGANIZATION_ID_LENGTH - prefix.length;
      const padding = paddingChars[i].repeat(paddingLength);
      maxLengthOrgIds.push(prefix + padding);
    }

    // Verify we have the right number and length, and all are unique
    expect(maxLengthOrgIds).toHaveLength(MAXIMUM_USER_ORGANIZATIONS);
    expect(new Set(maxLengthOrgIds).size).toBe(MAXIMUM_USER_ORGANIZATIONS);
    for (const orgId of maxLengthOrgIds) {
      expect(orgId).toHaveLength(MAXIMUM_ORGANIZATION_ID_LENGTH);
    }

    const audience = crypto.randomUUID();
    const audience_id: string = audience;
    const jwt_keys = await generateNewJwtKeySet({
      audience_id,
    });

    const jwt: AccessToken = await generateJWT({
      type: "access",
      audience,
      iat: Date.now(),
      user,
      client_app_id: SCHEMAVAULTS_CLI.app_id,
      jwt_keys,
      env: "test",
      orgs: maxLengthOrgIds,
    });

    // Verify the token is smaller than the browser cookie size limit
    const tokenSizeBytes = new Blob([jwt.token]).size;
    expect(tokenSizeBytes).toBeLessThan(MaximumBrowserCookieSize);

    // Verify the token can be decoded and contains all organizations
    const decoded = await decodeJWT({
      audience,
      jwt_keys,
      jwt: jwt.token,
      env: "test",
      type: "access",
    });
    expect(decoded.orgs).toBeArrayOfSize(MAXIMUM_USER_ORGANIZATIONS);
    for (const orgId of maxLengthOrgIds) {
      expect(decoded.orgs).toContain(orgId);
    }
  });

  it("should throw when the same organization ID appears multiple times", async () => {
    const audience = crypto.randomUUID();
    const audience_id: string = audience;
    const jwt_keys = await generateNewJwtKeySet({
      audience_id,
    });

    let errorThrown: boolean = false;
    try {
      await generateJWT({
        type: "access",
        audience,
        iat: Date.now(),
        user,
        client_app_id: SCHEMAVAULTS_CLI.app_id,
        jwt_keys,
        env: "test",
        orgs: ["same-org", "same-org", "same-org"],
      });
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBeTrue();
  });
});
