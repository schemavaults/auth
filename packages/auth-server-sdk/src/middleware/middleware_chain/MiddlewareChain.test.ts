import { DefaultMiddlewareFactory } from "@/middlewares/default_middleware";
import { MiddlewareChain } from "./middleware_chain";
import { test, describe, expect } from "bun:test";

describe("MiddlewareChain", () => {
  test("can initialize a middleware chain without any middlewares", () => {
    let errorThrown: boolean = false;
    try {
      const chain = new MiddlewareChain({
        debug: true,
        middlewares: [],
      });
      console.log(
        "Empty Middleware Flow String: ",
        chain.toMiddlewareFlowString(),
      );
    } catch (e: unknown) {
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("can initialize a middleware chain with several default middlewares", () => {
    let errorThrown: boolean = false;
    try {
      const chain = new MiddlewareChain({
        debug: true,
        middlewares: [
          new DefaultMiddlewareFactory(),
          new DefaultMiddlewareFactory(),
          new DefaultMiddlewareFactory(),
          new DefaultMiddlewareFactory(),
          new DefaultMiddlewareFactory(),
        ],
      });
      console.log(
        "Default Middlewares Chain Flow String: ",
        chain.toMiddlewareFlowString(),
      );
    } catch (e: unknown) {
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
