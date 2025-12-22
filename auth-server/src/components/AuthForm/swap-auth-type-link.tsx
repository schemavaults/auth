"use client";

import Link from "next/link";
import type { AuthFormType } from "./auth-form-type";
import type { ReactElement } from "react";
import { useSearchParams } from "next/navigation";

export function AuthFormSwapLink<T extends "login" | "register">({
  type,
}: AuthFormType<T>): ReactElement {
  let oppositeAuthFormHref: string =
    type === "login" ? "/auth/register" : "/auth/login";
  const searchParams = useSearchParams();

  if (searchParams.size > 0) {
    oppositeAuthFormHref += `?${searchParams.toString()}`;
  }

  if (type === "login") {
    return (
      <p className="text-center text-sm text-gray-600">
        Not an account holder?{" "}
        <Link
          href={oppositeAuthFormHref}
          className="font-semibold text-gray-800"
        >
          Sign up
        </Link>{" "}
        to get access.
      </p>
    );
  }
  return (
    <p className="text-center text-sm text-gray-600">
      Already have an account?{" "}
      <Link href={oppositeAuthFormHref} className="font-semibold text-gray-800">
        Sign in
      </Link>{" "}
      instead.
    </p>
  );
}

export default AuthFormSwapLink;
