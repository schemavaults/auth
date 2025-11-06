import type { EmailCredentials, EmailRegistrationCredentials } from "@schemavaults/auth-common";

export type AuthFormData<T extends 'login' | 'register'> = T extends 'login' ? EmailCredentials : EmailRegistrationCredentials;
