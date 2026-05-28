"use client";

import { type FC, type ReactElement } from "react";
import { RadioGroup, RadioGroupItem, Label } from "@schemavaults/ui";
import type { AvailableMfaFactor } from "@schemavaults/auth-common";
import { labelForFactorType } from "./factor-type-labels";

export interface MfaFactorPickerProps {
  factors: AvailableMfaFactor[];
  selected_factor_id: string;
  onSelect: (factor_id: string) => void;
  disabled?: boolean;
}

export const MfaFactorPicker: FC<MfaFactorPickerProps> = ({
  factors,
  selected_factor_id,
  onSelect,
  disabled,
}): ReactElement => {
  return (
    <RadioGroup
      value={selected_factor_id}
      onValueChange={onSelect}
      disabled={disabled}
      className="space-y-2"
      data-testid="mfa-factor-picker"
    >
      {factors.map((factor) => {
        const { label, description } = labelForFactorType(factor.factor_type);
        const inputId = `mfa-factor-${factor.factor_id}`;
        return (
          <div
            key={factor.factor_id}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <RadioGroupItem
              value={factor.factor_id}
              id={inputId}
              className="mt-1"
            />
            <Label
              htmlFor={inputId}
              className="flex flex-col gap-0.5 cursor-pointer"
            >
              <span className="font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">
                {description}
              </span>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
};

export default MfaFactorPicker;
