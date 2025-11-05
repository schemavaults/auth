import { JWT_Keys } from "@schemavaults/jwt";

export async function loadJwtKeysFromEnv(): Promise<JWT_Keys> {
  return await JWT_Keys.init();
}

export default loadJwtKeysFromEnv;
