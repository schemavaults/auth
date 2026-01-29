"use client";

import { useCallback, useState, useTransition, type ReactElement } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Checkbox,
  Textarea,
  useToast,
} from "@schemavaults/ui";
import { Save } from "lucide-react";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";
import { clearServerSettingsCache } from "./useServerSettings";

export interface EditServerSettingDialogProps {
  setting: ServerSettingRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditServerSettingDialog({
  setting,
  open,
  onOpenChange,
}: EditServerSettingDialogProps): ReactElement {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<unknown>(setting?.value);
  const [description, setDescription] = useState<string>(
    setting?.description ?? ""
  );

  // Reset state when setting changes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen && setting) {
        setValue(setting.value);
        setDescription(setting.description ?? "");
      }
      onOpenChange(newOpen);
    },
    [setting, onOpenChange]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!setting) return;

      startTransition(async () => {
        try {
          const response = await fetch(`/api/admin/settings/${setting.key}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              value,
              description: description || undefined,
            }),
          });

          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(
              body.message ?? `Request failed with status ${response.status}`
            );
          }

          const body = await response.json();
          if (!body.success) {
            throw new Error(body.message ?? "Failed to update setting");
          }

          toast({
            title: "Setting updated",
            description: `Successfully updated "${setting.key}"`,
          });

          clearServerSettingsCache();
          onOpenChange(false);
        } catch (e: unknown) {
          console.error("Failed to update setting:", e);
          toast({
            variant: "destructive",
            title: "Failed to update setting",
            description:
              e instanceof Error ? e.message : "An unknown error occurred",
          });
        }
      });
    },
    [setting, value, description, toast, onOpenChange]
  );

  const renderValueInput = (): ReactElement => {
    if (!setting) {
      return <Input disabled />;
    }

    switch (setting.valueType) {
      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="setting-value"
              checked={Boolean(value)}
              onCheckedChange={(checked) => setValue(checked)}
              disabled={isPending}
            />
            <Label htmlFor="setting-value">
              {value ? "Enabled" : "Disabled"}
            </Label>
          </div>
        );
      case "number":
        return (
          <Input
            id="setting-value"
            type="number"
            value={typeof value === "number" ? value : 0}
            onChange={(e) => setValue(e.target.valueAsNumber)}
            disabled={isPending}
          />
        );
      case "json":
        return (
          <Textarea
            id="setting-value"
            value={
              typeof value === "string" ? value : JSON.stringify(value, null, 2)
            }
            onChange={(e) => {
              try {
                setValue(JSON.parse(e.target.value));
              } catch {
                // Keep as string if not valid JSON yet
                setValue(e.target.value);
              }
            }}
            disabled={isPending}
            className="font-mono text-sm min-h-[100px]"
          />
        );
      case "string":
      default:
        return (
          <Input
            id="setting-value"
            type="text"
            value={typeof value === "string" ? value : String(value ?? "")}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Setting</DialogTitle>
            <DialogDescription>
              {setting ? (
                <>
                  Modify the value of{" "}
                  <code className="font-mono bg-muted px-1 py-0.5 rounded">
                    {setting.key}
                  </code>
                </>
              ) : (
                "No setting selected"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="setting-value">Value</Label>
              {renderValueInput()}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="setting-description">Description (optional)</Label>
              <Textarea
                id="setting-description"
                placeholder="Describe what this setting does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || !setting}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
