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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useForm,
  useToast,
} from "@schemavaults/ui";
import {
  type ReactElement,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldPlus } from "lucide-react";
import {
  assignMemberFormSchema,
  type AssignableOrganizationMembershipRole,
  type AssignMemberFormValues,
  type AssignMemberSubmitData,
  type OrganizationID,
} from "@schemavaults/auth-common";
import AssignOrganizationMemberDialogDispatchContext from "./AssignOrganizationMemberDialogDispatchContext";

export type { AssignMemberSubmitData };

/** A user the dialog can name without asking for an identifier. */
export interface AssignOrganizationMemberDialogUser {
  uid: string;
  email: string;
}

/** An organization offered by the organization select. */
export interface AssignOrganizationMemberDialogOrganizationOption {
  organization_id: OrganizationID;
  name: string;
}

/** How the dialog names the user to add. */
type AssigneeMode = "email" | "uid" | "self";

export interface AssignOrganizationMemberDialogOpenTriggerProps {
  triggerButtonLabel?: string;
}

const openAssignOrganizationMemberDialogTriggerButtonId: string =
  "open-assign-organization-member-dialog-button";
const assignOrganizationMemberDialogContentId: string =
  "assign-organization-member-dialog-content";

export function AssignOrganizationMemberDialogTriggerButton({
  triggerButtonLabel = "Add Member",
}: AssignOrganizationMemberDialogOpenTriggerProps): ReactElement {
  const onOpenChange = useContext(AssignOrganizationMemberDialogDispatchContext);
  return (
    <Button
      id={openAssignOrganizationMemberDialogTriggerButtonId}
      data-testid={openAssignOrganizationMemberDialogTriggerButtonId}
      variant="outline"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <ShieldPlus className="h-4 w-4 mr-2" />
      {triggerButtonLabel}
    </Button>
  );
}

export interface AssignOrganizationMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Performs the assignment; a thrown error is shown and keeps the dialog open. */
  onSubmit: (data: AssignMemberSubmitData) => Promise<void>;
  /**
   * The organization to add the member to (an organization's page): the
   * dialog then asks for the user. Without it the dialog offers
   * `organizations` to pick from.
   */
  organization_id?: OrganizationID;
  /** Display name of `organization_id`. */
  organization_name?: string;
  /** Organizations offered when `organization_id` is not set. */
  organizations?: readonly AssignOrganizationMemberDialogOrganizationOption[];
  /**
   * The user to add (a user's admin page): the dialog then asks for the
   * organization and role only.
   */
  user?: AssignOrganizationMemberDialogUser;
  /**
   * The signed-in administrator. When set (and `user` is not), the dialog
   * offers adding "Myself".
   */
  currentUser?: AssignOrganizationMemberDialogUser;
}

const ROLE_OPTIONS: readonly {
  value: AssignableOrganizationMembershipRole;
  label: string;
  description: string;
}[] = [
  {
    value: "member",
    label: "Member",
    description: "Can view the organization and its resources.",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Can also manage members, invitations and resources.",
  },
];

function defaultValues(
  organization_id: OrganizationID | undefined,
  fixed_user_uid: string | undefined,
): AssignMemberFormValues {
  return {
    organization_id: organization_id ?? "",
    input_mode: fixed_user_uid ? "uid" : "email",
    identifier: fixed_user_uid ?? "",
    role: "member",
  };
}

/**
 * @description Platform administrators' dialog to add a user to an
 * organization directly (no invitation to accept), by e-mail address, user
 * id or themselves, as a member or an owner. Either the organization
 * (`organization_id`) or the user (`user`) can be fixed by the page that
 * opens it.
 */
export function AssignOrganizationMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  organization_id,
  organization_name,
  organizations = [],
  user,
  currentUser,
}: AssignOrganizationMemberDialogProps): ReactElement {
  const [submitting, startSubmitting] = useTransition();
  const { toast } = useToast();
  const [assigneeMode, setAssigneeMode] = useState<AssigneeMode>("email");
  const fixedUserUid: string | undefined = user?.uid;

  const form = useForm<AssignMemberFormValues>({
    resolver: zodResolver(assignMemberFormSchema),
    defaultValues: defaultValues(organization_id, fixedUserUid),
  });

  // Start from a clean form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    form.reset(defaultValues(organization_id, fixedUserUid));
    setAssigneeMode("email");
  }, [open, organization_id, fixedUserUid, form]);

  const organizationIsFixed: boolean = organization_id !== undefined;
  const userIsFixed: boolean = user !== undefined;
  const canAssignSelf: boolean = !userIsFixed && currentUser !== undefined;

  function handleAssigneeModeChange(value: AssigneeMode): void {
    setAssigneeMode(value);
    if (value === "self" && currentUser) {
      form.setValue("input_mode", "uid");
      form.setValue("identifier", currentUser.uid);
    } else {
      form.setValue("input_mode", value === "uid" ? "uid" : "email");
      form.setValue("identifier", "");
    }
    form.clearErrors("identifier");
  }

  async function handleSubmit(values: AssignMemberFormValues): Promise<void> {
    startSubmitting(async () => {
      const submitData: AssignMemberSubmitData = {
        organization_id: values.organization_id,
        input_mode: values.input_mode,
        identifier: values.identifier.trim(),
        role: values.role,
      };

      try {
        await onSubmit(submitData);
      } catch (e: unknown) {
        console.error("Error adding organization member: ", e);
        toast({
          variant: "destructive",
          title: "Failed to add member",
          description:
            e instanceof Error ? e.message : "An unknown error has occurred!",
        });
        return;
      }

      onOpenChange(false);
    });
  }

  function handleCancel(): void {
    onOpenChange(false);
  }

  const inputLabel = assigneeMode === "uid" ? "User ID" : "Email Address";
  const inputPlaceholder =
    assigneeMode === "uid"
      ? "00000000-0000-0000-0000-000000000000"
      : "user@example.com";
  const inputDescription =
    assigneeMode === "uid"
      ? "Enter the UUID of the user to add."
      : "Enter the email address of the user to add.";

  const fixedOrganizationName: string | undefined = organizationIsFixed
    ? (organization_name ?? organization_id)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id={assignOrganizationMemberDialogContentId}
        data-testid={assignOrganizationMemberDialogContentId}
        className="sm:max-w-[480px]"
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(
              handleSubmit,
              function onFormValidationError(errs): void {
                console.error(
                  "Error validating add organization member form inputs: ",
                  errs,
                );
              },
            )}
            className="flex flex-col justify-start gap-4"
          >
            <DialogHeader>
              <DialogTitle>
                {userIsFixed ? "Add to an organization" : "Add a member"}
              </DialogTitle>
              <DialogDescription>
                {userIsFixed ? (
                  <>
                    Add{" "}
                    <span
                      className="font-medium text-foreground"
                      data-testid="assign-member-fixed-user"
                    >
                      {user?.email}
                    </span>{" "}
                    to an organization immediately.
                  </>
                ) : (
                  <>
                    Add a user to{" "}
                    <span className="font-medium text-foreground">
                      {fixedOrganizationName ?? "an organization"}
                    </span>{" "}
                    immediately.
                  </>
                )}{" "}
                As an administrator you skip the invitation: the user does
                not have to accept, and any pending invitation of theirs to
                the organization is revoked.
              </DialogDescription>
            </DialogHeader>

            {!organizationIsFixed && (
              <FormField
                control={form.control}
                name="organization_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization</FormLabel>
                    <Select
                      value={field.value === "" ? undefined : field.value}
                      onValueChange={field.onChange}
                      disabled={submitting || organizations.length === 0}
                      name={field.name}
                    >
                      <FormControl>
                        <SelectTrigger
                          data-testid="assign-member-organization-select"
                          className="w-full"
                        >
                          <SelectValue
                            placeholder={
                              organizations.length === 0
                                ? "No organizations available"
                                : "Select an organization"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {organizations.map((organization) => (
                          <SelectItem
                            key={organization.organization_id}
                            value={organization.organization_id}
                            data-testid={`assign-member-organization-select-option-${organization.organization_id}`}
                          >
                            {organization.name}{" "}
                            <span className="text-muted-foreground">
                              ({organization.organization_id})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {organizations.length === 0 && (
                      <FormDescription>
                        There is no organization to add{" "}
                        {userIsFixed ? "this user" : "a member"} to.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!userIsFixed && (
              <FormField
                control={form.control}
                name="input_mode"
                render={({ field }) => (
                  <FormItem className="flex flex-row gap-2 items-center flex-wrap">
                    <FormLabel className="w-full">Add by</FormLabel>
                    <FormControl>
                      <RadioGroup
                        data-testid="assign-member-input-mode-radio-group"
                        onValueChange={(value: string) =>
                          handleAssigneeModeChange(value as AssigneeMode)
                        }
                        value={assigneeMode}
                        disabled={submitting}
                        name={field.name}
                        className="flex flex-row flex-wrap gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="email"
                            id="assign-member-input-mode-email"
                            data-testid="assign-member-input-mode-email"
                          />
                          <Label htmlFor="assign-member-input-mode-email">
                            Email
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="uid"
                            id="assign-member-input-mode-user-id"
                            data-testid="assign-member-input-mode-user-id"
                          />
                          <Label htmlFor="assign-member-input-mode-user-id">
                            User ID
                          </Label>
                        </div>
                        {canAssignSelf && (
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value="self"
                              id="assign-member-input-mode-self"
                              data-testid="assign-member-input-mode-self"
                            />
                            <Label htmlFor="assign-member-input-mode-self">
                              Myself
                            </Label>
                          </div>
                        )}
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {!userIsFixed && assigneeMode !== "self" && (
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{inputLabel}</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="assign-member-identifier-input"
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
            )}

            {!userIsFixed && assigneeMode === "self" && currentUser && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="assign-member-self-summary"
              >
                You (
                <span className="font-medium text-foreground">
                  {currentUser.email}
                </span>
                ) will be added to the organization.
              </p>
            )}

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <RadioGroup
                      data-testid="assign-member-role-radio-group"
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={submitting}
                      name={field.name}
                      className="flex flex-col gap-2"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <div
                          key={option.value}
                          className="flex items-start space-x-2"
                        >
                          <RadioGroupItem
                            value={option.value}
                            id={`assign-member-role-${option.value}`}
                            data-testid={`assign-member-role-${option.value}`}
                            className="mt-0.5"
                          />
                          <Label
                            htmlFor={`assign-member-role-${option.value}`}
                            className="flex flex-col gap-1"
                          >
                            <span>{option.label}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {option.description}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
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
                data-testid="cancel-assign-member-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="submit-assign-member-form-button"
              >
                <ShieldPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default AssignOrganizationMemberDialog;
