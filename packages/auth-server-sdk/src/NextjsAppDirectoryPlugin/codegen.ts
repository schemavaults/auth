import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import resolveAppDirectory from "./resolve-app-directory";
import { join } from "path";
import resolveCodegenTemplatesDirectory from "./resolve-codegen-templates-directory";
import { extractVersion, getCodegenMarkerComment, hasCodegenMarker, prependCodegenMarker } from "./codegen-marker";

export interface IAuthResourceServerCodegenOptions {
  codegenTemplatesDirectory?: string;
  debug?: boolean;
}

interface ITemplateAuthPage {
  app_dir_path: `/auth/${string}`;
  codegen_template_path: string;
}

const pagesToCreate: readonly ITemplateAuthPage[] = [
  {
    app_dir_path: "/auth/login",
    codegen_template_path: "auth/login/page.tsx",
  },
  {
    app_dir_path: "/auth/register",
    codegen_template_path: "auth/register/page.tsx",
  },
  {
    app_dir_path: "/auth/logout",
    codegen_template_path: "auth/logout/page.tsx",
  },
  {
    app_dir_path: "/auth/authorize",
    codegen_template_path: "auth/authorize/page.tsx",
  },
  {
    app_dir_path: "/auth/error",
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

function createClientPages(appDirectory: string, templatesDir: string) {
  for (const page of pagesToCreate) {
    const destPath: string = join(appDirectory, page.app_dir_path, "page.tsx");
    const relPath = `${page.app_dir_path}/page.tsx`;

    if (existsSync(destPath)) {
      if (isCodegenManagedFile(destPath)) {
        const oldVersion = getExistingVersion(destPath);
        const templatePath: string = join(templatesDir, page.codegen_template_path);
        const templateContent: string = readFileSync(templatePath, {
          encoding: "utf-8",
        });
        writeFileSync(destPath, prependCodegenMarker(templateContent), {
          encoding: "utf-8",
        });
        console.log(` - updated '${relPath}'${formatVersionTransition(oldVersion)}`);
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

function createClientAuthProvider(appDirectory: string, templatesDir: string) {
  const srcTemplatePath: string = join(
    templatesDir,
    "auth",
    "auth-provider.tsx",
  );
  const destPath: string = join(appDirectory, "auth", "auth-provider.tsx");
  const relPath = "/auth/auth-provider.tsx";

  if (existsSync(destPath)) {
    if (isCodegenManagedFile(destPath)) {
      const oldVersion = getExistingVersion(destPath);
      const templateContent: string = readFileSync(srcTemplatePath, {
        encoding: "utf-8",
      });
      writeFileSync(destPath, prependCodegenMarker(templateContent), {
        encoding: "utf-8",
      });
      console.log(` - updated '${relPath}'${formatVersionTransition(oldVersion)}`);
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

export default async function codegen(
  opts?: IAuthResourceServerCodegenOptions,
) {
  console.log(
    `[@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin] Running codegen:`,
  );

  const debug = opts?.debug ?? false;

  const appDirectory: string = resolveAppDirectory(debug);
  console.log(` - resolved /app directory at '${appDirectory}'`);
  const authDirectory: string = join(appDirectory, "auth");
  if (!existsSync(authDirectory)) {
    mkdirSync(authDirectory);
    console.log(` - created /auth directory at '${authDirectory}'`);
  } else {
    console.log(` - /auth directory already exists at '${authDirectory}'`);
  }

  const templatesDir: string =
    typeof opts?.codegenTemplatesDirectory === "string"
      ? opts.codegenTemplatesDirectory
      : resolveCodegenTemplatesDirectory(debug);
  console.log(` - resolved codegen templates directory at '${templatesDir}'`);

  createClientPages(appDirectory, templatesDir);
  createClientAuthProvider(appDirectory, templatesDir);

  console.log(
    `[@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin] Codegen complete.`,
  );
}
