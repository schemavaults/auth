"use client";

import { Button, useToast } from "@schemavaults/ui";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useTransition } from "react";

export interface ViewAdminDashboardButtonProps {
  navigate: () => Promise<void>;
  admin: boolean;
}

export function ViewAdminDashboardButton({
  navigate,
  admin,
}: ViewAdminDashboardButtonProps): ReactNode {
  const { toast } = useToast();
  const [navigating, startNavigating] = useTransition();

  if (!admin) {
    return null;
  }

  return (
    <Button
      className="gap-2 flex"
      variant={"destructive"}
      disabled={navigating}
      onClick={() => {
        startNavigating(async (): Promise<void> => {
          try {
            await navigate();
          } catch (e: unknown) {
            console.error("Failed to navigate to admin dashboard: ", e);
            toast({
              variant: "destructive",
              title: "Failed to navigate to admin dashboard!",
            });
          }
        });
      }}
    >
      <span className="flex flex-row justify-start items-center">
        <SlidersHorizontal className="h-4 w-4 mr-2" key="admin-page-icon" />{" "}
        Admin dashboard
      </span>
    </Button>
  );
}

export default ViewAdminDashboardButton;
