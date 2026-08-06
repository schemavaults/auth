import { sanitizeNextHref } from "@schemavaults/auth-common";

/**
 * @name redirectToLogin
 * @description Redirect an unauthenticated request to the login page.
 * When `next_href` is provided (the same-origin path the user was trying
 * to reach), it is sanitized and forwarded as the `next_href` query
 * param so the post-login flow can return the user to it. Unsafe or
 * non-internal values are dropped rather than forwarded.
 */
export function redirectToLogin(
  redirect: (url: string) => never,
  next_href: string | undefined = undefined,
): never {
  const searchParams = new URLSearchParams();
  const sanitized_next_href: string | null = sanitizeNextHref(next_href);
  if (sanitized_next_href) {
    searchParams.set("next_href", sanitized_next_href);
  }

  let newPageUrl: string = `/auth/login`;
  if (searchParams.size > 0) {
    newPageUrl += `?${searchParams.toString()}`;
  }
  return redirect(newPageUrl);
}

export default redirectToLogin;
