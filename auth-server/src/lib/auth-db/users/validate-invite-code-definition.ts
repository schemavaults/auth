import "server-only";
import {
  type InviteCodeDefinition,
  inviteCodeDefinitionSchema,
} from "@schemavaults/auth-common";
import { getAppEnvironment } from "@schemavaults/app-definitions";

export function isValidInviteCodeDefinition(
  maybe_invite_code_definition: object,
): maybe_invite_code_definition is InviteCodeDefinition {
  const environment = getAppEnvironment();
  const parsed = inviteCodeDefinitionSchema.safeParse(
    maybe_invite_code_definition,
  );
  if (!parsed.success) {
    console.error("[isValidInviteCodeDefinition] Invalid invite code definition: ", parsed.error);
    if (environment === 'development' || environment === 'test') {
      console.error(maybe_invite_code_definition)
    }
    return false;
  }
  return true;
}

export function areValidInviteCodeDefinitions(
  maybe_invite_code_definitions: readonly object[],
): maybe_invite_code_definitions is readonly InviteCodeDefinition[] {
  if (!Array.isArray(maybe_invite_code_definitions)) {
    console.warn("areValidInviteCodeDefinitions did not receive an array")
    return false;
  }
  if (maybe_invite_code_definitions.length === 0) {
    return true;
  }
  if (
    !maybe_invite_code_definitions.every((maybe_invite_code_definition) =>
      isValidInviteCodeDefinition(maybe_invite_code_definition),
    )
  ) {
    return false;
  }
  return true;
}

export default isValidInviteCodeDefinition;
