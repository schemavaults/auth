import { describe, expect, test } from "bun:test";
import { getHardcodedApiServerIds } from "@schemavaults/app-definitions";
import { canOfferFirstPartyConnection } from "./first-party-option";

describe("canOfferFirstPartyConnection", () => {
  test("is never offered to anyone but a platform administrator", () => {
    expect(canOfferFirstPartyConnection(false, "notes-api")).toBe(false);
    expect(canOfferFirstPartyConnection(false, "")).toBe(false);
  });

  test("is offered to administrators for a registered API server id", () => {
    expect(canOfferFirstPartyConnection(true, "notes-api")).toBe(true);
    expect(canOfferFirstPartyConnection(true, "  notes-api  ")).toBe(true);
  });

  test("does not throw while the field is empty or holds a partial / malformed id", () => {
    for (const partial of ["", " ", "n", "not an id!", "x".repeat(65)]) {
      expect(() => canOfferFirstPartyConnection(true, partial)).not.toThrow();
      expect(canOfferFirstPartyConnection(true, partial)).toBe(true);
    }
  });

  test("is not offered for hardcoded API servers", () => {
    const hardcoded: readonly string[] = getHardcodedApiServerIds();
    expect(hardcoded.length).toBeGreaterThan(0);
    for (const id of hardcoded) {
      expect(canOfferFirstPartyConnection(true, id)).toBe(false);
      expect(canOfferFirstPartyConnection(true, ` ${id} `)).toBe(false);
    }
  });
});
