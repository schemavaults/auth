import { z } from "zod";

export const passwordSchema = z.string()
  .min(10, "Password must be at least 10 characters long")
  .max(255, "Password must be at most 255 characters long")
  .refine((password) => {
    return /[a-z]/.test(password);
  }, "Password must contain at least one lowercase letter")
  .refine((password) => {
    return /[A-Z]/.test(password);
  }, "Password must contain at least one uppercase letter")
  .refine((password) => {
    return /[0-9]/.test(password);
  }, "Password must contain at least one number")
  .refine((password) => {
    return /[^a-zA-Z0-9]/.test(password);
  }, "Password must contain at least one special character");
