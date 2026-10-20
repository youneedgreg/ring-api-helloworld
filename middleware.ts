import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Everything needs a signed-in family member except Clerk's own pages.
const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isApi = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isAuthPage(req)) return;

  // Ring posts webhooks without a Clerk session; the live stream (GET) stays protected.
  if (req.method === "POST" && req.nextUrl.pathname === "/api/webhook") return;

  if (isApi(req)) {
    // API callers get a plain 401 instead of a redirect to the sign-in page.
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
