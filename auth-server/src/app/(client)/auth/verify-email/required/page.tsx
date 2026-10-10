import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsApp,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  SchemaVaultsAppRegistry,
  ServerlessDatabase,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import { doesSsrContextHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";
import { isEmailVerificationRequiredForClientApp } from "@/lib/email-verification/third-party-app-gate";
import { buildResumeAuthorizeFlowHref } from "@/lib/email-verification/verify-email-required-href";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import redirectWithError from "@/lib/redirect-with-error";
import reportServerException from "@/lib/reportServerException";
import shouldEnableDebug from "@/lib/should-enable-debug";
import toPartialAppInfo from "@/lib/PartialAppInfo";
import EmailVerificationRequiredView from "./EmailVerificationRequiredView";

/**
 * `/auth/verify-email/required?app_id=…&code_challenge=…&…`
 *
 * The interstitial an unverified user is parked on when a THIRD-PARTY
 * client app asked the auth server to sign them in: the credentials were
 * accepted (the auth server session cookie is set) but no authorization
 * code was minted for the app, so the user is never sent to an external
 * site before verifying their e-mail address. The page carries the flow's
 * parameters so it can resume the hand-off (`/auth/login?…`, whose
 * already-signed-in branch mints the code and redirects) once the address
 * is verified — which the view detects by polling, or the user confirms
 * with the "Continue" button.
 *
 * Every state that does not need the interstitial is redirected away:
 * no `app_id` → the plain verify-email page; no auth server session →
 * the login page for the same flow; address already verified (or the
 * gate switched off) → straight back into the flow.
 */
export default async function EmailVerificationRequiredPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);
  const searchParams = await props.searchParams;

  const app_id = searchParams.app_id;
  if (typeof app_id !== "string" || !appIdSchema.safeParse(app_id).success) {
    // Nothing to resume without a client app: fall back to the plain
    // request-a-verification-link page.
    return redirect("/auth/verify-email");
  }
  if (app_id === getAuthServerAppId()) {
    // The auth server's own flow is never gated, so there is nothing to
    // wait for here — the account page has the verification indicator.
    return redirect("/account");
  }

  const resume_href: string = buildResumeAuthorizeFlowHref(searchParams);

  const session: UserData | false =
    await doesSsrContextHaveValidAuthServerRefreshToken();
  if (!session) {
    // Not signed in to the auth server (session expired, cookies cleared):
    // the login page for the same flow is the only way forward.
    return redirect(resume_href);
  }

  await using dbh = ServerlessDatabase.createDBH();

  let app: SchemaVaultsApp | null;
  try {
    app = await new SchemaVaultsAppRegistry(dbh.db).getApp(app_id);
  } catch (e: unknown) {
    console.error(
      `[EmailVerificationRequiredPage] Failed to load app with ID "${app_id}": `,
      e,
    );
    await reportServerException(e, {
      op_name: "EmailVerificationRequiredPage.getApp",
      route: "/auth/verify-email/required",
      uid: session.uid,
      context: { app_id },
    });
    redirectWithError(500, "internal_server_error");
  }
  if (!app) {
    redirectWithError(404, "app_id_not_found");
  }

  let user: UserDocument | null;
  try {
    user = await new UserRegistry(dbh.db, debug).getUserByUID(session.uid);
  } catch (e: unknown) {
    console.error(
      `[EmailVerificationRequiredPage] Failed to load user '${session.uid}': `,
      e,
    );
    await reportServerException(e, {
      op_name: "EmailVerificationRequiredPage.getUserByUID",
      route: "/auth/verify-email/required",
      uid: session.uid,
      context: { app_id },
    });
    redirectWithError(500, "load_user_data_failure");
  }
  if (!user) {
    redirectWithError(500, "load_user_data_failure");
  }

  let gated: boolean;
  try {
    gated = await isEmailVerificationRequiredForClientApp({
      db: dbh.db,
      client_app_id: app_id,
      email_verified: user.email_verified === true,
    });
  } catch (e: unknown) {
    console.error(
      "[EmailVerificationRequiredPage] Failed to check email verification requirements: ",
      e,
    );
    await reportServerException(e, {
      op_name: "EmailVerificationRequiredPage.isEmailVerificationRequiredForClientApp",
      route: "/auth/verify-email/required",
      uid: session.uid,
      context: { app_id },
    });
    redirectWithError(500, "load_server_config_failure");
  }
  if (!gated) {
    // Verified (or the gate is off): resume the hand-off right away.
    return redirect(resume_href);
  }

  return (
    <EmailVerificationRequiredView
      app={toPartialAppInfo(app)}
      email={user.email}
      resume_href={resume_href}
      auth_server_app_id={getAuthServerAppId()}
      debug={debug}
    />
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
