import type { PasswordRequirement } from "@schemavaults/ui";

// Mirrors passwordSchema in @schemavaults/auth-common so the on-screen
// checklist matches the server-side validation the user will hit on submit.
export const authPasswordRequirements: PasswordRequirement[] = [
  {
    id: "min-length-10",
    label: "At least 10 characters",
    validate: (password) => password.length >= 10,
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter",
    validate: (password) => /[a-z]/.test(password),
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter",
    validate: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "At least one number",
    validate: (password) => /[0-9]/.test(password),
  },
  {
    id: "special",
    label: "At least one special character",
    validate: (password) => /[^a-zA-Z0-9]/.test(password),
  },
];
