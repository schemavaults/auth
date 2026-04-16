import type { Base_SchemaVaults_tRPC_Resources } from "@/context";
import type { SchemaVaults_tRPC_Runtime } from "@/schemavaults-trpc-runtime";
import type { UserData } from "@schemavaults/auth-server-sdk";
import { TRPCError } from "@trpc/server";

export function createProcedures<R extends Base_SchemaVaults_tRPC_Resources>(
  middleware: SchemaVaults_tRPC_Runtime<R>["middleware"],
  procedure: SchemaVaults_tRPC_Runtime<R>["procedure"],
) {
  // "Base Procedure" -- most procedures should be behind authentication middleware (instead of importing here)
  const publicProcedure: SchemaVaults_tRPC_Runtime<R>["procedure"] = procedure;

  const isAuthed = middleware((opts) => {
    const { ctx } = opts;
    if (!ctx) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No context found",
      });
    }

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to perform this action",
      });
    }

    const user: UserData = ctx.user;

    return opts.next({
      ctx: {
        ...ctx,
        user,
      },
    });
  });

  const authorizedProcedure = publicProcedure.use(isAuthed);

  const isAdmin = middleware((opts) => {
    if (!opts.ctx.user?.admin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You must be an admin user to perform this action",
      });
    }

    return opts.next(opts);
  });

  const adminProcedure = authorizedProcedure.use(isAdmin);

  return {
    public: publicProcedure,
    authorized: authorizedProcedure,
    admin: adminProcedure,
  } as const;
}
