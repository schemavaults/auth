import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { cwd } from "process";
import resolveAppDirectory from "./resolve-app-directory";
import { join } from "path";
import resolveCodegenTemplatesDirectory from "./resolve-codegen-templates-directory";
import { extractVersion, getCodegenMarkerComment, hasCodegenMarker, prependCodegenMarker } from "./codegen-marker";

export interface IAuthResourceServerCodegenOptions {
  /**
   * Custom output directory for the generated `auth/` files.
   *
   * When provided, this is treated as the path to the auth directory itself
   * (i.e., the directory in which `login/page.tsx`, `register/page.tsx`,
   * `auth-provider.tsx`, etc. are written). Relative paths are resolved
   * against the current working directory.
   *
   * When omitted, defaults to `<resolved-app-directory>/auth`.
   *
   * Example: `src/app/(client)/auth` to nest the generated routes inside a
   * Next.js route group.
   */
  outputDirectory?: string;
  codegenTemplatesDirectory?: string;
  debug?: boolean;
}

interface ITemplateAuthPage {
  /** Path of the page within the generated `auth/` directory. */
  auth_relative_path: string;
  codegen_template_path: string;
}

const pagesToCreate: readonly ITemplateAuthPage[] = [
  {
    auth_relative_path: "login",
    codegen_template_path: "auth/login/page.tsx",
  },
  {
    auth_relative_path: "register",
    codegen_template_path: "auth/register/page.tsx",
  },
  {
    auth_relative_path: "logout",
    codegen_template_path: "auth/logout/page.tsx",
  },
  {
    auth_relative_path: "authorize",
    codegen_template_path: "auth/authorize/page.tsx",
  },
  {
    auth_relative_path: "error",
    codegen_template_path: "auth/error/page.tsx",
  },
];

function isCodegenManagedFile(filePath: string): boolean {
  const content = readFileSync(filePath, { encoding: "utf-8" });
  const firstLine = content.split("\n")[0] ?? "";
  return hasCodegenMarker(firstLine);
}

function getExistingVersion(filePath: string): string | null {
  const content = readFileSync(filePath, { encoding: "utf-8" });
  const firstLine = content.split("\n")[0] ?? "";
  return extractVersion(firstLine);
}

function formatVersionTransition(oldVersion: string | null): string {
  const newMarker = getCodegenMarkerComment();
  const newVersion = extractVersion(newMarker);
  if (oldVersion && newVersion && oldVersion !== newVersion) {
    return ` (${oldVersion} => ${newVersion})`;
  }
  return "";
}

function createClientPages(authDirectory: string, templatesDir: string) {
  for (const page of pagesToCreate) {
    const destPath: string = join(authDirectory, page.auth_relative_path, "page.tsx");
    const relPath = `auth/${page.auth_relative_path}/page.tsx`;

    if (existsSync(destPath)) {
      if (isCodegenManagedFile(destPath)) {
        const oldVersion = getExistingVersion(destPath);
        const newVersion = extractVersion(getCodegenMarkerComment());
        if (oldVersion && newVersion && oldVersion === newVersion) {
          console.log(` - skipped '${relPath}' (no version change)`);
        } else {
          const templatePath: string = join(templatesDir, page.codegen_template_path);
          const templateContent: string = readFileSync(templatePath, {
            encoding: "utf-8",
          });
          writeFileSync(destPath, prependCodegenMarker(templateContent), {
            encoding: "utf-8",
          });
          console.log(` - updated '${relPath}'${formatVersionTransition(oldVersion)}`);
        }
      } else {
        console.log(
          ` - skipping '${relPath}' (user-customized, no codegen marker)`,
        );
      }
      continue;
    }

    const destDir: string = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    const templatePath: string = join(templatesDir, page.codegen_template_path);
    const templateContent: string = readFileSync(templatePath, {
      encoding: "utf-8",
    });
    writeFileSync(destPath, prependCodegenMarker(templateContent), {
      encoding: "utf-8",
    });
    console.log(` - created '${relPath}'`);
  }
}

function createClientAuthProvider(authDirectory: string, templatesDir: string) {
  const srcTemplatePath: string = join(
    templatesDir,
    "auth",
    "auth-provider.tsx",
  );
  const destPath: string = join(authDirectory, "auth-provider.tsx");
  const relPath = "auth/auth-provider.tsx";

  if (existsSync(destPath)) {
    if (isCodegenManagedFile(destPath)) {
      const oldVersion = getExistingVersion(destPath);
      const newVersion = extractVersion(getCodegenMarkerComment());
      if (oldVersion && newVersion && oldVersion === newVersion) {
        console.log(` - skipped '${relPath}' (no version change)`);
      } else {
        const templateContent: string = readFileSync(srcTemplatePath, {
          encoding: "utf-8",
        });
        writeFileSync(destPath, prependCodegenMarker(templateContent), {
          encoding: "utf-8",
        });
        console.log(` - updated '${relPath}'${formatVersionTransition(oldVersion)}`);
      }
    } else {
      console.log(
        ` - skipping '${relPath}' (user-customized, no codegen marker)`,
      );
    }
    return;
  }

  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const templateContent: string = readFileSync(srcTemplatePath, {
    encoding: "utf-8",
  });
  writeFileSync(destPath, prependCodegenMarker(templateContent), {
    encoding: "utf-8",
  });
  console.log(` - created '${relPath}'`);
}

function resolveAuthOutputDirectory(
  outputDirectoryOption: string | undefined,
  debug: boolean,
): string {
  if (typeof outputDirectoryOption === "string" && outputDirectoryOption.length > 0) {
    const resolved = isAbsolute(outputDirectoryOption)
      ? outputDirectoryOption
      : resolve(cwd(), outputDirectoryOption);
    console.log(` - using custom auth output directory '${resolved}'`);
    return resolved;
  }
  const appDirectory: string = resolveAppDirectory(debug);
  console.log(` - resolved /app directory at '${appDirectory}'`);
  return join(appDirectory, "auth");
}

export default async function codegen(
  opts?: IAuthResourceServerCodegenOptions,
) {
  console.log(
    `[@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin] Running codegen:`,
  );

  const debug = opts?.debug ?? false;

  const authDirectory: string = resolveAuthOutputDirectory(
    opts?.outputDirectory,
    debug,
  );
  if (!existsSync(authDirectory)) {
    mkdirSync(authDirectory, { recursive: true });
    console.log(` - created auth output directory at '${authDirectory}'`);
  } else {
    console.log(` - auth output directory already exists at '${authDirectory}'`);
  }

  const templatesDir: string =
    typeof opts?.codegenTemplatesDirectory === "string"
      ? opts.codegenTemplatesDirectory
      : resolveCodegenTemplatesDirectory(debug);
  console.log(` - resolved codegen templates directory at '${templatesDir}'`);

  createClientPages(authDirectory, templatesDir);
  createClientAuthProvider(authDirectory, templatesDir);

  console.log(
    `[@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin] Codegen complete.`,
  );
}
