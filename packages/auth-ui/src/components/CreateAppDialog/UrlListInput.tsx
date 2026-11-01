"use client";

import type { ReactElement, ReactNode } from "react";
import { Button, Input, Label } from "@schemavaults/ui";
import { Plus, X } from "lucide-react";

export interface UrlListInputProps {
  /** Prefix of the element ids: `<id>-input-<index>`, `<id>-add-button`. */
  id: string;
  label: string;
  description: ReactNode;
  placeholder: string;
  values: readonly string[];
  /** Error message per row, index-aligned with `values`. */
  errors?: readonly (string | undefined)[];
  onChange: (values: string[]) => void;
  addLabel: string;
  /** Most rows the list can hold. */
  max: number;
  disabled?: boolean;
}

/**
 * A list of URL inputs with "add" / "remove" buttons, for the create app
 * form's domains and callback URLs. Always keeps at least one row.
 */
export function UrlListInput({
  id,
  label,
  description,
  placeholder,
  values,
  errors,
  onChange,
  addLabel,
  max,
  disabled = false,
}: UrlListInputProps): ReactElement {
  function setRow(index: number, next: string): void {
    onChange(values.map((value, i) => (i === index ? next : value)));
  }

  function removeRow(index: number): void {
    const remaining = values.filter((_, i) => i !== index);
    onChange(remaining.length > 0 ? remaining : [""]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-input-0`}>{label}</Label>
      {values.map((value, index) => {
        const error = errors?.[index];
        return (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                id={`${id}-input-${index}`}
                placeholder={placeholder}
                value={value}
                onChange={(e) => setRow(index, e.target.value)}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                autoComplete="off"
                inputMode="url"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                disabled={disabled || (values.length === 1 && value === "")}
                onClick={() => removeRow(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {error ? (
              <p className="text-sm font-medium text-destructive">{error}</p>
            ) : null}
          </div>
        );
      })}
      <div>
        <Button
          id={`${id}-add-button`}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || values.length >= max}
          onClick={() => onChange([...values, ""])}
        >
          <Plus className="h-4 w-4 mr-2" />
          {addLabel}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default UrlListInput;
