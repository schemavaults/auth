import "server-only";

export function redirectToLogin(
  redirect: (url: string) => never,
  next: string | undefined = undefined,
): never {
  const searchParams = new URLSearchParams();
  if (typeof next === "string" && next.startsWith("/")) {
    searchParams.set("next", next);
  }

  let newPageUrl: string = `/auth/login`;
  if (searchParams.size > 0) {
    newPageUrl += `?${searchParams.toString()}`;
  }
  return redirect(newPageUrl);
}

export default redirectToLogin;
