import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicCardPath } from "@/shared/lib/public-card-path";
import { storedSessionNeedsRefresh } from "@/shared/lib/supabase/access-token";
import { VIEWER_COOKIE } from "@/shared/lib/viewer";

function isPublicCard(pathname: string) {
  return isPublicCardPath(pathname);
}

/**
 * These pages do not need the signed-in user, so they never rotate.
 * The camera opens the card without a client session. Connect and the
 * scanner stay out of this list: an expired access token refreshes here,
 * and the new cookie is on the request before the page reads it.
 */
function leavesSessionAlone(pathname: string) {
  return (
    isPublicCard(pathname) ||
    pathname.startsWith("/api/c/") ||
    pathname === "/open" ||
    pathname === "/handoff" ||
    pathname === "/auth/confirm" ||
    pathname === "/auth/callback"
  );
}

function forward(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("x-aded-viewer");
  const cookie = request.cookies
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  return NextResponse.next({ request: { headers } });
}

function dropViewer(response: NextResponse, request: NextRequest) {
  if (!request.cookies.get(VIEWER_COOKIE)) return;
  response.cookies.set({
    name: VIEWER_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
}

function closedEvent(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (path === "/api/events" || path.startsWith("/api/events/")) {
    return NextResponse.json({ error: "Not available" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (path === "/e" || path.startsWith("/e/")) {
    return NextResponse.redirect(new URL("/network", request.url));
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const closed = closedEvent(request);
  if (closed) {
    dropViewer(closed, request);
    return closed;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const response = forward(request);
    dropViewer(response, request);
    return response;
  }

  let supabaseResponse = forward(request);
  const pathname = request.nextUrl.pathname;
  const h = request.headers;
  const isDocument = h.get("sec-fetch-dest") === "document" || (h.get("accept") ?? "").includes("text/html");
  const isPrefetch =
    h.get("next-router-prefetch") === "1" ||
    h.get("purpose") === "prefetch" ||
    (h.get("sec-purpose") ?? "").includes("prefetch");
  const isRsc = h.get("rsc") === "1";

  // A full document load is the only server rotation. Prefetch, RSC and API
  // reads must not rotate: the visible tab refreshes, or the next real
  // navigation does. /save stays a document load (2e5bc9e).
  if (
    !leavesSessionAlone(pathname) &&
    isDocument &&
    !isPrefetch &&
    !isRsc &&
    (await storedSessionNeedsRefresh(request.cookies.getAll()))
  ) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = forward(request);
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    });

    await supabase.auth.getUser();
  }

  dropViewer(supabaseResponse, request);
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
