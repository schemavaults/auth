"use client";

import { Button, useToast } from "@schemavaults/ui";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useTransition, type ReactElement } from "react";

export interface ViewFullUserProfileButtonProps {
  navigate: () => Promise<void>;
}

export function ViewFullUserProfileButton({ navigate }: ViewFullUserProfileButtonProps): ReactElement {
  const [navigating, startNavigating] = useTransition();
  const {toast} = useToast();

  return (
    <Button
      onClick={() => {
        startNavigating(async (): Promise<void> => {
          try {
            await navigate();
          } catch (e: unknown) {
            console.error(e);
            toast({
              variant: 'destructive',
              title: "Error navigating to page"
            });
          }
        })
      }}
      className="gap-2 flex"
      disabled={navigating}
    >
      {
        navigating ? (
          <span className="flex flex-row justify-start items-center">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" key="loader" /> Navigating...
          </span>
        ) : (
          <span className="flex flex-row justify-start items-center">
            <SlidersHorizontal className="h-4 w-4 mr-2" key="full-profile-account-icon" /> View authentication dashboard
          </span>
        )
      }
    </Button>
  );
}

export default ViewFullUserProfileButton;
