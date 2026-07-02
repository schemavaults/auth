"use client";

import type { ReactElement } from "react";
import {
  Wordmark as UiWordmark,
  type WordmarkProps as UiWordmarkProps,
} from "@schemavaults/ui";
import { useAuthServerFriendlyName } from "./AuthServerFriendlyNameProvider";

export type WordmarkProps = Omit<UiWordmarkProps, "wordmarkText">;

/**
 * @description Auth-server wrapper around the @schemavaults/ui <Wordmark />
 * that renders the deployment's friendly name (from the
 * SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME environment variable) instead of the
 * package's built-in default, enabling white-label deployments.
 */
export function Wordmark(props: WordmarkProps): ReactElement {
  const friendly_name: string = useAuthServerFriendlyName();
  return <UiWordmark {...props} wordmarkText={friendly_name} />;
}

export default Wordmark;
