import type { IAuthResourceServerCodegenOptions } from "./codegen";

export class NextjsAppDirectoryPlugin {
  public static async codegen(opts?: IAuthResourceServerCodegenOptions) {
    const gen = await import("./codegen").then((m) => m.default);
    return await gen(opts);
  }
}

export default NextjsAppDirectoryPlugin;
