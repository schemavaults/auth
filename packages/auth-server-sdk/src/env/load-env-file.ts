import { readFile } from "fs/promises";

/** Index of the first unescaped `"` in `text`, or -1. */
function findClosingQuote(text: string): number {
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
    } else if (text[index] === '"') {
      return index;
    }
  }
  return -1;
}

function unescapeDoubleQuoted(text: string): string {
  return text.replace(/\\(n|"|\\)/g, (_, escaped: string) =>
    escaped === "n" ? "\n" : escaped,
  );
}

/**
 * Minimal dotenv-format parser for the CLI's `--env-file`: `KEY=value`
 * lines, optional `export ` prefix, `#` comments, single-quoted (literal)
 * and double-quoted (`\n` escapes, may span lines, e.g. a PEM key) values.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = (lines[index] as string).trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as string;
    const rawValue = match[2] as string;

    if (rawValue.startsWith('"')) {
      let quoted = rawValue.slice(1);
      let end = findClosingQuote(quoted);
      while (end === -1 && index + 1 < lines.length) {
        index++;
        quoted += `\n${lines[index] as string}`;
        end = findClosingQuote(quoted);
      }
      result[key] = unescapeDoubleQuoted(end === -1 ? quoted : quoted.slice(0, end));
    } else if (rawValue.startsWith("'")) {
      const end = rawValue.indexOf("'", 1);
      result[key] = end === -1 ? rawValue.slice(1) : rawValue.slice(1, end);
    } else {
      // Unquoted: an inline comment starts at " #".
      const comment = rawValue.search(/\s#/);
      result[key] = (comment === -1 ? rawValue : rawValue.slice(0, comment)).trim();
    }
  }
  return result;
}

/**
 * Copies `keys` from a dotenv file into `env` (default `process.env`).
 * Values in the file win over values already set: the file is named
 * explicitly to pick a deployment.
 *
 * @returns the keys that were set.
 */
export async function loadEnvFile(
  path: string,
  keys: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<string[]> {
  const parsed = parseEnvFile(await readFile(path, "utf8"));
  const loaded: string[] = [];
  for (const key of keys) {
    const value = parsed[key];
    if (value !== undefined) {
      env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}
