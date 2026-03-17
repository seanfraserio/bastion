import { auth } from "@/lib/auth";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const publicPaths = [
    "/login",
    "/onboarding",
    "/logo.svg",
  ];

  const isPublicPath = publicPaths.some((path) =>
    nextUrl.pathname.startsWith(path)
  );
  const isAuthApi = nextUrl.pathname.startsWith("/api/auth");
  const isNextAsset = nextUrl.pathname.startsWith("/_next");

  if (isPublicPath || isAuthApi || isNextAsset) {
    return;
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.href);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
