"use client";

import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  RadioGroup,
  RadioGroupItem,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useForm,
  useToast,
} from "@schemavaults/ui";
import { type ReactElement, useContext, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import {
  inviteMemberFormSchema,
  type InviteMemberFormValues,
  type InviteMemberInputMode,
  type InviteMemberSubmitData,
} from "@schemavaults/auth-common";
import InviteMemberDialogDispatchContext from "./InviteMemberDialogDispatchContext";

export type { InviteMemberSubmitData };

export interface InviteMemberDialogOpenTriggerProps {
  triggerButtonLabel?: string;
}

export function InviteMemberDialogTriggerButton({
  triggerButtonLabel = "Invite Member",
}: InviteMemberDialogOpenTriggerProps): ReactElement {
  const onOpenChange = useContext(InviteMemberDialogDispatchContext);
  return (
    <Button
      id="open-invite-member-dialog-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <UserPlus className="h-4 w-4 mr-2" />
      {triggerButtonLabel}
    </Button>
  );
}

export interface InviteMemberDialogProps {
  organization_id: string;
  onSubmit: (data: InviteMemberSubmitData) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerButtonLabel?: string;
}

export function InviteMemberDialog({
  organization_id,
  onSubmit,
  open,
  onOpenChange,
}: InviteMemberDialogProps): ReactElement {
  const [submitting, startSubmitting] = useTransition();
  const { toast } = useToast();

  const form = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberFormSchema),
    defaultValues: {
      input_mode: "email",
      identifier: "",
      organization_id,
    },
  });

  const currentInputMode = form.watch("input_mode");

  function handleInputModeChange(value: InviteMemberInputMode): void {
    form.setValue("input_mode", value);
    form.setValue("identifier", "");
    form.clearErrors("identifier");
    return;
  }

  async function handleSubmit(values: InviteMemberFormValues): Promise<void> {
    startSubmitting(async () => {
      const submitData: InviteMemberSubmitData = {
        organization_id,
        input_mode: values.input_mode,
      };

      if (values.input_mode === "uid") {
        submitData.uid = values.identifier;
      } else {
        submitData.email = values.identifier;
      }

      try {
        await onSubmit(submitData);
      } catch (e: unknown) {
        console.error("Error submitting invite member form: ", e);
        toast({
          variant: "destructive",
          title: "Error submitting invite member form!",
          description:
            e instanceof Error ? e.message : "An unknown error has occurred!",
        });
        return;
      }

      form.reset();
      onOpenChange(false);
    });
  }

  function handleCancel(): void {
    form.reset();
    onOpenChange(false);
  }

  const inputLabel = currentInputMode === "email" ? "Email Address" : "User ID";
  const inputPlaceholder =
    currentInputMode === "email"
      ? "user@example.com"
      : "00000000-0000-0000-0000-000000000000";
  const inputDescription =
    currentInputMode === "email"
      ? "Enter the email address of the user to invite."
      : "Enter the UUID of the user to invite.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="invite-member-dialog-content"
        className="sm:max-w-[425px]"
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(
              handleSubmit,
              function onFormValidationError(errs): void {
                console.error(
                  "Error validating invite member form inputs: ",
                  errs,
                );
                toast({
                  variant: "destructive",
                  title: "Error validating invite member form inputs!",
                  description:
                    "Please ensure that the inputs have been filled correctly.",
                });
                return;
              },
            )}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription>
                Invite a user to join this organization by email address or user
                ID.
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="input_mode"
              render={({ field }) => (
                <FormItem className="flex flex-row gap-2 items-center flex-wrap">
                  <FormLabel className="w-full">Invite by</FormLabel>
                  <FormControl>
                    <RadioGroup
                      data-testid="invite-member-input-mode-radio-group"
                      onValueChange={(value: string) =>
                        handleInputModeChange(value as InviteMemberInputMode)
                      }
                      value={field.value}
                      disabled={submitting}
                      name={field.name}
                      className="flex flex-row gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="email"
                          id="input-mode-email"
                          data-testid="input-mode-email"
                        />
                        <Label htmlFor="input-mode-email">Email</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="uid"
                          id="input-mode-user-id"
                          data-testid="input-mode-user-id"
                        />
                        <Label htmlFor="input-mode-user-id">User ID</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{inputLabel}</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="invite-member-identifier-input"
                      placeholder={inputPlaceholder}
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>{inputDescription}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={submitting}
                data-testid="cancel-invite-member-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="submit-invite-member-form-button"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default InviteMemberDialog;
