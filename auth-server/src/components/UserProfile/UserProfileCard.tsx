"use client";

import { useEffect, useTransition, type FC, type ReactElement } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  cn,
  useForm,
  useToast,
} from "@schemavaults/ui";
import {
  updateUserProfileRequestSchema,
  userDisplayNameSchema,
  userNamePartSchema,
  usernameFormatSchema,
  userProfileResponseSchema,
  type UpdateUserProfileRequest,
  type UserProfileNames,
} from "@schemavaults/auth-common";
import { IdCard } from "lucide-react";
import {
  USER_PROFILE_ENDPOINT,
  useUserProfile,
} from "./useUserProfile";

/**
 * Form-side validation: inputs hold plain strings, where the empty
 * string means "not set". Non-empty values are checked against the same
 * shared schemas the server enforces, and their issues are surfaced
 * verbatim so inline messages match API validation.
 */
function optionalProfileField(schema: z.ZodString): z.ZodType<string> {
  return z.string().superRefine((value, ctx) => {
    if (value.trim() === "") return;
    const result = schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue(issue);
      }
    }
  });
}

const profileFormSchema = z.object({
  username: optionalProfileField(usernameFormatSchema),
  first_name: optionalProfileField(userNamePartSchema),
  middle_name: optionalProfileField(userNamePartSchema),
  last_name: optionalProfileField(userNamePartSchema),
  display_name: optionalProfileField(userDisplayNameSchema),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function profileToFormValues(
  profile: UserProfileNames | undefined,
): ProfileFormValues {
  return {
    username: profile?.username ?? "",
    first_name: profile?.first_name ?? "",
    middle_name: profile?.middle_name ?? "",
    last_name: profile?.last_name ?? "",
    display_name: profile?.display_name ?? "",
  };
}

function formValuesToUpdateRequest(
  values: ProfileFormValues,
): UpdateUserProfileRequest {
  const normalize = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };
  return updateUserProfileRequestSchema.parse({
    username: normalize(values.username),
    first_name: normalize(values.first_name),
    middle_name: normalize(values.middle_name),
    last_name: normalize(values.last_name),
    display_name: normalize(values.display_name),
  });
}

export interface UserProfileCardProps {
  className?: string;
  /**
   * SSR-preloaded profile from the account page's server component, so
   * the form renders populated on first paint.
   */
  preloaded_profile?: UserProfileNames;
}

interface ProfileFieldConfig {
  name: keyof ProfileFormValues;
  label: string;
  placeholder: string;
  autoComplete: string;
  description?: string;
}

const NAME_PART_FIELDS: readonly ProfileFieldConfig[] = [
  {
    name: "first_name",
    label: "First name",
    placeholder: "Ada",
    autoComplete: "given-name",
  },
  {
    name: "middle_name",
    label: "Middle name",
    placeholder: "King",
    autoComplete: "additional-name",
  },
  {
    name: "last_name",
    label: "Last name",
    placeholder: "Lovelace",
    autoComplete: "family-name",
  },
];

/**
 * Account-page card for the user's profile name fields: personal name
 * parts (first/middle/last), the public display name, and the unique
 * username. Saves via PUT /api/user/profile with full-replacement
 * semantics (cleared inputs clear the stored values).
 */
export const UserProfileCard: FC<UserProfileCardProps> = ({
  className,
  preloaded_profile,
}): ReactElement => {
  const { toast } = useToast();
  const [saving, startTransition] = useTransition();
  const {
    data: profile,
    isLoading,
    mutate: mutateProfile,
  } = useUserProfile({ initialData: preloaded_profile });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: profileToFormValues(preloaded_profile ?? profile),
  });

  // Sync the form when a (re)fetch reports different stored values —
  // but never while the user has unsaved edits in progress.
  const { reset, formState } = form;
  useEffect(() => {
    if (profile && !formState.isDirty) {
      reset(profileToFormValues(profile));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function onSubmit(values: ProfileFormValues): void {
    startTransition(async () => {
      let request: UpdateUserProfileRequest;
      try {
        request = formValuesToUpdateRequest(values);
      } catch {
        toast({
          variant: "destructive",
          title: "Invalid profile",
          description: "Please correct the highlighted fields and try again.",
        });
        return;
      }

      try {
        const response = await fetch(USER_PROFILE_ENDPOINT, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const body: unknown = await response.json().catch(() => ({}));

        if (response.status === 409) {
          form.setError("username", {
            type: "server",
            message: "That username is already taken.",
          });
          return;
        }
        const parsed = userProfileResponseSchema.safeParse(body);
        if (!response.ok || !parsed.success) {
          const message =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : `Failed to save profile (status: ${response.status})`;
          throw new Error(message);
        }

        await mutateProfile(parsed.data.profile, { revalidate: false });
        reset(profileToFormValues(parsed.data.profile));
        toast({
          title: "Profile saved",
          description: "Your profile has been updated.",
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to save profile",
          description:
            e instanceof Error ? e.message : "An unknown error occurred.",
        });
      }
    });
  }

  return (
    <Card className={cn("w-full", className)} data-testid="user-profile-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard className="h-5 w-5 text-muted-foreground" />
          Profile
        </CardTitle>
        <CardDescription>
          Your name and public display name. The display name (and username)
          may be shared with applications you sign in to.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-row flex-wrap gap-4">
              {NAME_PART_FIELDS.map(
                (fieldConfig): ReactElement => (
                  <FormField
                    key={fieldConfig.name}
                    control={form.control}
                    name={fieldConfig.name}
                    render={({ field }) => (
                      <FormItem className="min-w-48 grow basis-0">
                        <FormLabel>{fieldConfig.label}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={fieldConfig.placeholder}
                            autoComplete={fieldConfig.autoComplete}
                            data-testid={`profile-${fieldConfig.name}-input`}
                            disabled={isLoading || saving}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ),
              )}
            </div>
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="How your name is displayed publicly"
                      autoComplete="nickname"
                      data-testid="profile-display_name-input"
                      disabled={isLoading || saving}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Shown publicly and shared with connected applications as
                    your name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="your-username"
                      autoComplete="username"
                      data-testid="profile-username-input"
                      disabled={isLoading || saving}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A unique handle for your account: 3–32 letters, numbers,
                    &apos;.&apos;, &apos;_&apos;, or &apos;-&apos;.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={isLoading || saving || !formState.isDirty}
              data-testid="profile-save-button"
            >
              {saving ? "Saving…" : "Save Profile"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default UserProfileCard;
