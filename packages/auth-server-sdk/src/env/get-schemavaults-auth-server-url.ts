import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions/get-app-environment";
import { getAuthServerUrl } from "@schemavaults/app-definitions";

export default function getSchemaVaultsAuthServerUrl(): string {
  return getAuthServerUrl(
    getAppEnvironment() satisfies SchemaVaultsAppEnvironment,
  );
}
