import { describe, test, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

describe("auth-server migrations", () => {
  test("all migration files follow the 5-digit prefix naming convention", () => {
    const invalid = migrationFiles.filter(
      (f) => !/^\d{5}[-_]/.test(f),
    );
    expect(invalid).toEqual([]);
  });

  test("all migration files have unique 5-digit prefixes (no naming conflicts)", () => {
    const prefixToFiles = new Map<string, string[]>();

    for (const file of migrationFiles) {
      const prefix = file.slice(0, 5);
      const existing = prefixToFiles.get(prefix);
      if (existing) {
        existing.push(file);
      } else {
        prefixToFiles.set(prefix, [file]);
      }
    }

    const conflicts = [...prefixToFiles.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([prefix, files]) => `${prefix}: ${files.join(", ")}`);

    if (conflicts.length > 0) {
      throw new Error(
        `Migration naming conflicts detected:\n${conflicts.join("\n")}`,
      );
    }

    expect(conflicts).toEqual([]);
  });
});
