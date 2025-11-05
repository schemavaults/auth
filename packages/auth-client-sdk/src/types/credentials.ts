import type { credentialsSchema } from "@/lib/credentials-schema";
import type { z } from "zod";

export type Credentials = z.infer<typeof credentialsSchema>;
