import { existsSync, mkdirSync } from "fs";
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
    codegen_template_path: "/auth/login/page.tsx",
  },
  {
    app_dir_path: "/auth/login",
    codegen_template_path: "/auth/register/page.tsx",
  },
  {
    app_dir_path: "/auth/logout",
    codegen_template_path: "/auth/logout/page.tsx",
  },
  {
    app_dir_path: "/auth/authorize",
    codegen_template_path: "/auth/authorize/page.tsx",
  },
];

export default async function codegen(opts: IAuthResourceServerCodegenOptions) {
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
    typeof opts.codegenTemplatesDirectory === "string"
      ? opts.codegenTemplatesDirectory
      : resolveCodegenTemplatesDirectory();
  console.log(` - resolved codegen templates directory at '${templatesDir}'`);
}
