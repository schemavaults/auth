import { describe, expect, test } from "bun:test";
import { HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS } from "./hardcoded-core-schemavaults-app-domains";

describe("Hardcoded App Domains", () => {
  test("Each hardcoded app domain has a unique ID", () => {
    const uuidSet = new Set();

    let errorThrown: boolean = false;
    try {
      // Throw an error if any of the domain ref IDs are not unique
      [...HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS].forEach((domain) => {
        if (uuidSet.has(domain.app_domain_ref_id)) {
          throw new Error(`Duplicate UUID found: ${domain.app_domain_ref_id}`);
        }
        uuidSet.add(domain.app_domain_ref_id);
      });
    } catch (e: unknown) {
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
