import NextjsAppDirectoryPlugin from "@schemavaults/auth-server-sdk/NextjsAppDirectoryPlugin";
async function codegen(): Promise<void> {
  await NextjsAppDirectoryPlugin.codegen({});
}

codegen();
