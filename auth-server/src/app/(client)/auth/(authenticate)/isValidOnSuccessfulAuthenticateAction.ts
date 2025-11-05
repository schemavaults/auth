import {
  type OnSuccessfulAuthenticateAction,
  onSuccessfulAuthenticateActionSchema,
} from "@/lib/authentication_outcome_type";

export function isValidOnSuccessfulAuthenticateAction(
  on_successful_authenticate: unknown,
): on_successful_authenticate is OnSuccessfulAuthenticateAction {
  if (!on_successful_authenticate) {
    return false;
  } else if (
    !onSuccessfulAuthenticateActionSchema.safeParse(on_successful_authenticate)
      .success
  ) {
    return false;
  }

  return true;
}

export default isValidOnSuccessfulAuthenticateAction;
