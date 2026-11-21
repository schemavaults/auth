import { describe, expect, test } from "bun:test";
import { lookupTxtRecords, type TxtResolver } from "./lookup-txt-records";

function failingWith(code: string): TxtResolver {
  return async () => {
    throw Object.assign(new Error(code), { code });
  };
}

describe("lookupTxtRecords", () => {
  test("joins each record's character-strings", async () => {
    const queried: string[] = [];
    const result = await lookupTxtRecords("_auth-domain-verification.API.example.com.", async (name) => {
      queried.push(name);
      return [["auth-domain-verification=", "abc"], ["v=spf1 -all"]];
    });
    expect(queried).toEqual(["_auth-domain-verification.api.example.com"]);
    expect(result).toEqual({
      kind: "records",
      records: ["auth-domain-verification=abc", "v=spf1 -all"],
    });
  });

  test("treats NXDOMAIN and NODATA as an authoritative absence", async () => {
    expect(await lookupTxtRecords("x.example.com", failingWith("ENOTFOUND"))).toEqual({ kind: "no_records" });
    expect(await lookupTxtRecords("x.example.com", failingWith("ENODATA"))).toEqual({ kind: "no_records" });
    expect(await lookupTxtRecords("x.example.com", async () => [])).toEqual({ kind: "no_records" });
  });

  test("reports other failures without concluding anything", async () => {
    expect(await lookupTxtRecords("x.example.com", failingWith("ETIMEOUT"))).toEqual({
      kind: "lookup_failed",
      code: "ETIMEOUT",
    });
    expect(await lookupTxtRecords("x.example.com", failingWith("ESERVFAIL"))).toEqual({
      kind: "lookup_failed",
      code: "ESERVFAIL",
    });
    expect(
      await lookupTxtRecords("x.example.com", async () => {
        throw new Error("no code");
      }),
    ).toEqual({ kind: "lookup_failed", code: "UNKNOWN" });
  });

  test("answers names under .invalid without querying (RFC 6761 §6.4)", async () => {
    let queried = false;
    const resolve: TxtResolver = async () => {
      queried = true;
      return [["unexpected"]];
    };
    expect(await lookupTxtRecords("_auth-domain-verification.api.squat.invalid", resolve)).toEqual({
      kind: "no_records",
    });
    expect(queried).toBe(false);
  });
});
