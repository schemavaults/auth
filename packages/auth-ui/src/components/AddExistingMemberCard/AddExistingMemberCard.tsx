"use client";

import { type ReactElement, useMemo, useTransition } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  type ComboboxOption,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  useForm,
  useToast,
} from "@schemavaults/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useSWRConfig } from "swr";
import {
  addExistingMemberFormSchema,
  addExistingMemberRoles,
  type AddExistingMemberFormValues,
  type AddExistingMemberRole,
  type AddExistingMemberSubmitData,
  type OrganizationID,
  type UserData,
} from "@schemavaults/auth-common";
import { useAllUsers } from "@/components/UsersCard/useAllUsers";
import {
  getOrganizationMembersEndpoint,
  useOrganizationMembers,
} from "@/components/OrganizationMembersTable/useOrganizationMembers";

export type { AddExistingMemberSubmitData };

export const addExistingMemberCardTestId = "add-existing-member-card";
export const addExistingMemberUserComboboxTestId =
  "add-existing-member-user-combobox";
export const addExistingMemberRoleSelectTestId =
  "add-existing-member-role-select";
export const addExistingMemberSubmitButtonTestId =
  "submit-add-existing-member-form-button";

const ROLE_LABELS: Record<AddExistingMemberRole, string> = {
  member: "Member",
  owner: "Owner",
};

function userOptionLabel(user: UserData): string {
  const name =
    user.display_name ??
    [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name ? `${name} (${user.email})` : user.email;
}

export interface AddExistingMemberCardProps {
  organization_id: OrganizationID;
  /**
   * Performs the add. Throw to surface an error toast; on resolution the
   * organization members list is revalidated and the form reset.
   */
  onSubmit: (data: AddExistingMemberSubmitData) => Promise<void>;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
}

/**
 * Administrator-only form for adding an already-registered user to an
 * organization by picking them from the global users list, bypassing the
 * invitation flow. Mount only for global admins: the underlying users list
 * endpoint rejects everyone else.
 */
export function AddExistingMemberCard({
  organization_id,
  onSubmit,
  cardTitle = "Add Existing User",
  cardDescription = "Administrators can add any registered user to this organization directly, without sending an invitation.",
  cardClassName,
}: AddExistingMemberCardProps): ReactElement {
  const [submitting, startSubmitting] = useTransition();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const users = useAllUsers();
  const members = useOrganizationMembers(organization_id);

  const form = useForm<AddExistingMemberFormValues>({
    resolver: zodResolver(addExistingMemberFormSchema),
    defaultValues: {
      organization_id,
      uid: "",
      role: "member",
    },
  });

  const options: readonly ComboboxOption[] = useMemo(() => {
    const memberUids = new Set(
      (members.data ?? []).map((member) => member.uid),
    );
    return (users.data ?? [])
      .filter((user) => !memberUids.has(user.uid))
      .map(
        (user): ComboboxOption => ({
          value: user.uid,
          label: userOptionLabel(user),
          description: user.uid,
          keywords: [user.email, user.uid, user.username ?? ""].filter(
            Boolean,
          ),
        }),
      );
  }, [users.data, members.data]);

  const usersLoading = !users.data && users.isLoading;
  const usersFailed = !!users.error;

  async function handleSubmit(
    values: AddExistingMemberFormValues,
  ): Promise<void> {
    startSubmitting(async () => {
      try {
        await onSubmit({
          organization_id,
          uid: values.uid,
          role: values.role,
        });
      } catch (e: unknown) {
        console.error("Error submitting add existing member form: ", e);
        toast({
          variant: "destructive",
          title: "Failed to add user to organization!",
          description:
            e instanceof Error ? e.message : "An unknown error has occurred!",
        });
        return;
      }

      await mutate(getOrganizationMembersEndpoint(organization_id));
      form.reset({ organization_id, uid: "", role: "member" });
    });
  }

  return (
    <Card
      className={cn("w-full", cardClassName)}
      data-testid={addExistingMemberCardTestId}
    >
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-4 md:flex-row md:items-start"
          >
            <FormField
              control={form.control}
              name="uid"
              render={({ field }) => (
                <FormItem className="flex-1 min-w-0">
                  <FormLabel>User</FormLabel>
                  <FormControl>
                    <Combobox
                      data-testid={addExistingMemberUserComboboxTestId}
                      options={options}
                      value={field.value}
                      onValueChange={(value: string) => {
                        field.onChange(value);
                        form.clearErrors("uid");
                      }}
                      placeholder={
                        usersLoading
                          ? "Loading users..."
                          : usersFailed
                            ? "Failed to load users"
                            : "Select a user..."
                      }
                      searchPlaceholder="Search by email, name, or user ID..."
                      emptyMessage="No matching users."
                      fullWidth
                      clearable
                      disabled={submitting || usersLoading || usersFailed}
                    />
                  </FormControl>
                  <FormDescription>
                    Users who are already members are not listed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem className="md:w-40">
                  <FormLabel>Role</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger
                        data-testid={addExistingMemberRoleSelectTestId}
                      >
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {addExistingMemberRoles.map((role) => (
                        <SelectItem
                          key={role}
                          value={role}
                          data-testid={`add-existing-member-role-option-${role}`}
                        >
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Initial role.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col md:pt-8">
              <Button
                type="submit"
                disabled={submitting || usersLoading || usersFailed}
                data-testid={addExistingMemberSubmitButtonTestId}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add to Organization
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default AddExistingMemberCard;
