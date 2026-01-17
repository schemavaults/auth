import { test, expect } from "bun:test";

import {
  type NavigationPath,
  parseNavigationPath,
} from "./parse-navigation-path";
import {
  type AuthMiddlewareRules,
  evaluateAuthMiddlewareRules as _evaluateAuthMiddlewareRules,
  type AuthenticationStatus,
} from "./middleware-rules";

function evaluateAuthMiddlewareRules(
  currentPath: NavigationPath,
  authStatus: AuthenticationStatus,
  rules: AuthMiddlewareRules,
) {
  return _evaluateAuthMiddlewareRules(currentPath, authStatus, rules, "test");
}

const examplePublicRoutes = [
  [], //              /
  ["api", "auth", "token"], // /api/token
];
const exampleUnauthedRoutes = [
  ["auth", "login"],
  ["auth", "register"],
  ["auth", "forgot-password"],
];
const exampleAuthedRoutes = [
  ["vaults"],
  ["vaults", "my-vault"],
  ["vaults", "my-vault", "secrets"],
];
const exampleAdminRoutes = [
  ["admin"],
  ["admin", "users"],
  ["admin", "users", "create"],
];
const exampleApiRoutes = [
  ["trpc"], //        /trpc/*
  ["api"], //           /api/*
];

const exampleRules: AuthMiddlewareRules = {
  public: examplePublicRoutes,
  unauthed: exampleUnauthedRoutes,
  authed: exampleAuthedRoutes,
  admin: exampleAdminRoutes,
  api: exampleApiRoutes,
};

test("unauthenticated users are not redirected from public routes", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/"),
      {
        status: "logged-out",
      } satisfies AuthenticationStatus,
      exampleRules,
    ),
  ).toEqual(["logged-out", "on", "public"]);
});

test("authenticated users are not redirected from public routes", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/"),
      {
        status: "logged-in",
      } satisfies AuthenticationStatus,
      exampleRules,
    ),
  ).toEqual(["logged-in", "on", "public"]);
});

test("unauthenticated users are not redirected from unauthed routes", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/auth/login"),
      {
        status: "logged-out",
      } satisfies AuthenticationStatus,
      exampleRules,
    ),
  ).toEqual(["logged-out", "on", "unauthed"]);
});

test("authenticated users are redirected from unauthed routes", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/auth/login"),
      {
        status: "logged-in",
      } satisfies AuthenticationStatus,
      exampleRules,
    ),
  ).toEqual(["logged-in", "on", "unauthed"]);
});

test("unauthenticated users are redirected from authed routes", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/vaults/my-vault"),
      {
        status: "logged-out",
      } satisfies AuthenticationStatus,
      exampleRules,
    ),
  ).toEqual(["logged-out", "on", "authed"]);
});

test("authenticated users are not redirected from authed routes", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/vaults/my-vault"),
      {
        status: "logged-in",
      } satisfies AuthenticationStatus,
      exampleRules,
    ),
  ).toEqual(["logged-in", "on", "authed"]);
});

test("the login page is an unauthed route", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/auth/login"),
      {
        status: "logged-in",
      } satisfies AuthenticationStatus,
      exampleRules,
    )[2],
  ).toEqual("unauthed");
});

test("the register page is an unauthed route", () => {
  expect(
    evaluateAuthMiddlewareRules(
      parseNavigationPath("/auth/login"),
      {
        status: "logged-in",
      } satisfies AuthenticationStatus,
      exampleRules,
    )[2],
  ).toEqual("unauthed");
});

test("routes ending in /api or /trpc return a 401 error, not a redirect", () => {
  function testApiRoute(route: string, authStatus: AuthenticationStatus) {
    const [status, on, route_type] = evaluateAuthMiddlewareRules(
      parseNavigationPath(route),
      authStatus,
      exampleRules,
    );

    expect(status).toEqual(authStatus.status);
    expect(on).toEqual("on");
    expect(route_type).toEqual("api");
  }

  const loggedIn = {
    status: "logged-in",
  } satisfies AuthenticationStatus;

  const loggedOut = {
    status: "logged-out",
  } satisfies AuthenticationStatus;

  testApiRoute("/api/delete/the/production/database", loggedIn);
  testApiRoute("/api", loggedIn);
  testApiRoute("/trpc/delete/the/production/database", loggedIn);
  testApiRoute("/api/delete/the/production/database", loggedIn);
  testApiRoute("/api/delete/the/production/database", loggedOut);
  testApiRoute("/api", loggedOut);
  testApiRoute("/trpc/delete/the/production/database", loggedOut);
  testApiRoute("/api/delete/the/production/database", loggedOut);
});

test("routes ending in /api or /trpc that are explicitly public are treated as public", () => {
  function testPublicApiRoute(route: string) {
    const [status, on, route_type] = evaluateAuthMiddlewareRules(
      parseNavigationPath(route),
      {
        status: "logged-in",
      } satisfies AuthenticationStatus,
      exampleRules,
    );

    expect(status).toEqual("logged-in");
    expect(on).toEqual("on");
    expect(route_type).toEqual("public");
  }

  testPublicApiRoute("/api/auth/token");
  testPublicApiRoute("/api/auth/token/refresh/blah/blah/blah");
});
