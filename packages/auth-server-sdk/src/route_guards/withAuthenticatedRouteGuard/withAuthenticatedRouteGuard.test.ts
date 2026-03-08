import { describe, expect, test } from "bun:test";
import withAuthenticatedApiRouteGuard from "./withAuthenticatedApiRouteGuard";
import withAuthenticatedServerComponentRouteGuard from "./withAuthenticatedServerComponentRouteGuard";
import { type NextRequest, NextResponse } from "next/server";
import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import type { IBaseProtectedAuthenticatedServerComponentPageProps } from "./IBaseProtectedAuthenticatedServerComponentPageProps";
import type { IBaseProtectedAuthenticatedApiRouteInputs } from "./IBaseProtectedAuthenticatedApiRouteInputs";

interface CustomApiRouteInputs
  extends IBaseProtectedAuthenticatedApiRouteInputs {
  custom_prop: string;
}

interface CustomServerComponentProps
  extends IBaseProtectedAuthenticatedServerComponentPageProps {
  custom_prop: string;
}

describe("withAuthenticatedRouteGuard", () => {
  describe("withAuthenticatedApiRouteGuard", () => {
    test("can initialize API route guard", async () => {
      const route_guard: (req: NextRequest) => Promise<NextResponse> =
        withAuthenticatedApiRouteGuard(
          async (inputs): Promise<NextResponse> => {
            return NextResponse.json(
              {
                success: true,
                message: "Example protected route guard response!",
              },
              { status: 200 },
            );
          },
        );
      expect(route_guard).toBeFunction();
    });

    test("can initialize API route guard with custom props", async () => {
      const route_guard: (req: NextRequest) => Promise<NextResponse> =
        withAuthenticatedApiRouteGuard<CustomApiRouteInputs>(
          async (inputs: CustomApiRouteInputs): Promise<NextResponse> => {
            const custom_prop: string = inputs.custom_prop;
            expect(custom_prop).toBeString();
            return NextResponse.json(
              {
                success: true,
                message: "Example protected route guard response!",
              },
              { status: 200 },
            );
          },
          { custom_prop: "Hello World!" },
        );
      expect(route_guard).toBeFunction();
    });
  });

  describe("withAuthenticatedServerComponentRouteGuard", () => {
    test("can initialize server component route guard", async () => {
      try {
        const rendered = await withAuthenticatedServerComponentRouteGuard(
          async function ExampleProtectedServerComponent(
            props: IBaseProtectedAuthenticatedServerComponentPageProps,
          ): Promise<ReactElement> {
            void props;
            redirect("/");
          },
        );

        void rendered;
      } catch {
        /** no-op */
      }
    });

    test("can initialize server component route guard with custom props", async () => {
      try {
        const rendered =
          await withAuthenticatedServerComponentRouteGuard<CustomServerComponentProps>(
            async function ExampleProtectedServerComponent(
              props: CustomServerComponentProps,
            ): Promise<ReactElement> {
              const custom_prop: string = props.custom_prop;
              expect(custom_prop).toBeString();
              redirect("/");
            },
          );

        void rendered;
      } catch {
        /** no-op */
      }
    });
  });
});
