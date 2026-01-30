import { existsSync, mkdirSync } from "fs";
import resolveAppDirectory from "./resolve-app-directory";
import { join } from "path";

interface ITemplateAuthPage {
  app_dir_path: `/auth/${string}`;
  codegen_template_path: string;
}

const pagesToCreate: readonly ITemplateAuthPage[] = [
  {
    app_dir_path: "/auth/login",
    codegen_template_path: "login.tsx",
  },
  {
    app_dir_path: "/auth/login",
    codegen_template_path: "register.tsx",
  },
  {
    app_dir_path: "/auth/logout",
    codegen_template_path: "logout.tsx",
  },
  {
    app_dir_path: "/auth/authorize",
    codegen_template_path: "authorize.tsx",
  },
];

export default async function codegen() {
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
}
