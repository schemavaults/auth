import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import type { SchemaVaultsAppRegistry } from "./app-registry";
import type { AuthorizedAppDeclaration } from "./authorized-apps-registry";

export async function getDefinitionForAuthorizedDeclaration(
  authorized_declaration: AuthorizedAppDeclaration,
  appsRegistry: SchemaVaultsAppRegistry
): Promise<SchemaVaultsApp> {
  const app_id: string = authorized_declaration.app_id;
  try {
    const app = await appsRegistry.getApp(app_id);
    if (!app) throw new Error(`Failed to load app with id ${app_id}`);
    return app;
  } catch (e: unknown) {
    console.error(e);
    throw new Error(`Failed to load load app definition from authorization declaration for app "${app_id}"`)
  }
}
