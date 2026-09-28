"use client";

import { useState } from "react";
import {
  isResourceOwnershipSelectionAvailable,
  resolveDefaultResourceOwnershipSelection,
  type PreferredResourceOwnership,
  type ResourceOwnershipChoices,
  type ResourceOwnershipSelection,
} from "./resource-ownership-choices";

export interface UseResourceOwnershipSelectionResult {
  /**
   * The owner currently picked: the viewer's own pick while it is still
   * available, otherwise the default for the dialog. `null` when no owner
   * is available at all.
   */
  selection: ResourceOwnershipSelection | null;
  setSelection: (selection: ResourceOwnershipSelection) => void;
  /** Forgets the viewer's pick (back to the default). */
  resetSelection: () => void;
}

/**
 * @description The owner picked in a create dialog. Until the viewer picks
 * one, the default follows the choices as they load (e.g. the organization
 * list arriving after the dialog opened).
 */
export function useResourceOwnershipSelection(
  defaultOwnership: PreferredResourceOwnership,
  choices: ResourceOwnershipChoices,
): UseResourceOwnershipSelectionResult {
  const [picked, setPicked] = useState<ResourceOwnershipSelection | null>(
    null,
  );
  const selection: ResourceOwnershipSelection | null =
    picked && isResourceOwnershipSelectionAvailable(picked, choices)
      ? picked
      : resolveDefaultResourceOwnershipSelection(defaultOwnership, choices);
  return {
    selection,
    setSelection: setPicked,
    resetSelection: () => setPicked(null),
  };
}

export default useResourceOwnershipSelection;
