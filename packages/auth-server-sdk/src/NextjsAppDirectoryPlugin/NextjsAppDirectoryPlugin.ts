export class NextjsAppDirectoryPlugin {
  public static async codegen() {
    const gen = await import("./codegen").then((m) => m.default);
    return await gen();
  }
}

export default NextjsAppDirectoryPlugin;
