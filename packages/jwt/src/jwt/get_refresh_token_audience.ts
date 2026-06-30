import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getIssuer from "./get_issuer";

export default function getRefreshTokenAudience(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  return getIssuer(environment);
}
