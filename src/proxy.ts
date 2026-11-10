import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicCardPath } from "@/shared/lib/public-card-path";
import { storedSessionNeedsRefresh } from "@/shared/lib/supabase/access-token";
import { VIEWER_COOKIE, VIEWER_HEADER, viewerId } from "@/shared/lib/viewer";

const YEAR_SECONDS = 60 * 60 * 24 * 400;

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
    pathname === "/auth/confirm"
  );
}

function viewerFor(request: NextRequest) {
  if (!isPublicCard(request.nextUrl.pathname)) return { id: undefined as string | undefined, fresh: false };
  const existing = viewerId(request.cookies.get(VIEWER_COOKIE)?.value);
  return { id: existing ?? crypto.randomUUID(), fresh: !existing };
}

function forward(request: NextRequest, viewer: string | undefined) {
  const headers = new Headers(request.headers);
  if (viewer) headers.set(VIEWER_HEADER, viewer);
  const cookie = request.cookies
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  return NextResponse.next({ request: { headers } });
}

function rememberViewer(response: NextResponse, request: NextRequest, viewer: string | undefined, fresh: boolean) {
  if (!fresh || !viewer) return;
  response.cookies.set({
    name: VIEWER_COOKIE,
    value: viewer,
    path: "/",
    maxAge: YEAR_SECONDS,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const viewer = viewerFor(request);
  if (!url || !anonKey) {
    const response = forward(request, viewer.id);
    rememberViewer(response, request, viewer.id, viewer.fresh);
    return response;
  }

  let supabaseResponse = forward(request, viewer.id);
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
          supabaseResponse = forward(request, viewer.id);
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

  rememberViewer(supabaseResponse, request, viewer.id, viewer.fresh);
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
