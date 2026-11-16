"use client";

import { type FormEvent, type ReactElement } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  OTPInput,
} from "@schemavaults/ui";
import { USER_CODE_GROUP_SIZE, USER_CODE_LENGTH } from "@schemavaults/auth-common";
import { ArrowRight, Loader2, MonitorSmartphone } from "lucide-react";
import { DEVICE_VERIFICATION_CARD_CLASS_NAME } from "./card-class-name";

export interface UserCodeEntryCardProps {
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (code: string) => void;
  submitting: boolean;
  error: string | null;
}

/** Step 1 of `/device`: the user types the code their device shows. */
export function UserCodeEntryCard({
  code,
  onCodeChange,
  onSubmit,
  submitting,
  error,
}: UserCodeEntryCardProps): ReactElement {
  const complete: boolean = code.length === USER_CODE_LENGTH;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (complete && !submitting) {
      onSubmit(code);
    }
  }

  return (
    <Card className={DEVICE_VERIFICATION_CARD_CLASS_NAME} data-testid="device-user-code-entry">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="flex flex-row items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" />
            Connect a device
          </CardTitle>
          <CardDescription>
            Enter the code shown on your device, TV or terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <OTPInput
            length={USER_CODE_LENGTH}
            groupSize={USER_CODE_GROUP_SIZE}
            mode="alphanumeric"
            value={code}
            onChange={(value) => onCodeChange(value.toUpperCase())}
            onComplete={(value) => {
              if (!submitting) onSubmit(value.toUpperCase());
            }}
            focusOnMount
            disabled={submitting}
            invalid={error !== null}
            aria-label="Device code"
            className="max-w-full"
            slotClassName="uppercase"
          />
          {error ? (
            <p className="text-sm text-destructive text-center" role="alert" data-testid="device-user-code-error">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Only enter a code that is shown on a device you are setting up yourself.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-row justify-end">
          <Button type="submit" disabled={!complete || submitting} data-testid="device-user-code-submit">
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Continue
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default UserCodeEntryCard;
