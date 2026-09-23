import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getUserProfile, updateUserProfile } from "./operation";

// GET, PUT /api/user/profile
export const { GET, PUT } = apiRouteHandlers([getUserProfile, updateUserProfile]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
