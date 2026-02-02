import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import resolveAppDirectory from "./resolve-app-directory";
import { join } from "path";
import resolveCodegenTemplatesDirectory from "./resolve-codegen-templates-directory";

export interface IAuthResourceServerCodegenOptions {
  codegenTemplatesDirectory?: string;
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
];

export default async function codegen(
  opts?: IAuthResourceServerCodegenOptions,
) {
  console.log(
    `[@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin] Running codegen:`,
  );

  const appDirectory: string = resolveAppDirectory();
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
      : resolveCodegenTemplatesDirectory();
  console.log(` - resolved codegen templates directory at '${templatesDir}'`);

  for (const page of pagesToCreate) {
    const destPath: string = join(appDirectory, page.app_dir_path, "page.tsx");
    if (existsSync(destPath)) {
      console.log(` - skipping ${page.app_dir_path}/page.tsx (already exists)`);
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
    writeFileSync(destPath, templateContent, { encoding: "utf-8" });
    console.log(` - created '${page.app_dir_path}/page.tsx'`);
  }

  console.log(
    `[@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin] Codegen complete.`,
  );
}
