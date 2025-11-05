import { z } from "zod";

export const AuthMiddlewareErrorTypes = [
  "Unauthorized",
  "Forbidden",
] as const satisfies readonly string[];

export type AuthMiddlewareError = (typeof AuthMiddlewareErrorTypes)[number];

export const authMiddlewareErrorTypesSchema = z
  .string()
  .refine((str): str is AuthMiddlewareError => {
    const errorTypes: readonly string[] = AuthMiddlewareErrorTypes;
    return errorTypes.includes(str);
  });
