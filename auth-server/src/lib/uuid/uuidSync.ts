import isServer from "@/lib/isServerRuntime";
import { v4 } from "uuid";

export function uuidSync(): string {
  if (isServer()) {
    return crypto.randomUUID()
  } else {
    if (window.isSecureContext) {
      return crypto.randomUUID()
    } else {
      return v4();
    }
  }
}

export default uuidSync;
