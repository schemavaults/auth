import { describe, expect, test } from "bun:test";
import { parseEnvFile } from "./load-env-file";

describe("parseEnvFile", () => {
  test("reads plain, exported, quoted and commented values", () => {
    expect(
      parseEnvFile(
        [
          "# comment",
          "",
          "PLAIN=value",
          "SPACED = spaced value  ",
          "export EXPORTED=yes",
          "INLINE=value # trailing comment",
          "HASH=a#b",
          "SINGLE='literal \\n $x'",
          'DOUBLE="line1\\nline2 \\"quoted\\""',
          "EMPTY=",
          "not a line",
        ].join("\n"),
      ),
    ).toEqual({
      PLAIN: "value",
      SPACED: "spaced value",
      EXPORTED: "yes",
      INLINE: "value",
      HASH: "a#b",
      SINGLE: "literal \\n $x",
      DOUBLE: 'line1\nline2 "quoted"',
      EMPTY: "",
    });
  });

  test("reads a double-quoted value spanning lines (a PEM key)", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIabc\ndef==\n-----END PRIVATE KEY-----";
    expect(parseEnvFile(`KEY="${pem}"\r\nNEXT=1\r\n`)).toEqual({ KEY: pem, NEXT: "1" });
  });
});
