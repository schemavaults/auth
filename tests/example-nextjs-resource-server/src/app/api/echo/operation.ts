import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { ErrorResponse } from "@/lib/api/schemas";

export const echo = defineOperation({
  method: "post",
  path: "/api/echo",
  summary: "Echo a message",
  description:
    "Demonstrates JSON body validation: the body is parsed with the declared zod schema and a 400 with per-field issues is returned when it does not match.",
  tags: ["Demo"],
  auth: publicAccess(),
  request: {
    body: {
      description: "Message to echo back",
      schema: z
        .object({
          message: z.string().min(1).max(280).openapi({ example: "hello" }),
          repeat: z.number().int().min(1).max(5).default(1).openapi({
            description: "How many times to repeat the message (1-5)",
          }),
        })
        .openapi("EchoRequest"),
    },
  },
  responses: {
    200: {
      description: "The echoed message(s)",
      schema: z.object({ echoes: z.array(z.string()) }).openapi("EchoResponse"),
    },
    400: { description: "The body failed validation", schema: ErrorResponse },
  },
  handler: (ctx) =>
    ctx.json(200, { echoes: Array.from({ length: ctx.body.repeat }, () => ctx.body.message) }),
});
