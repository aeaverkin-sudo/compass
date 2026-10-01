import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VIEWER_COOKIE, VIEWER_HEADER, viewerId } from "@/shared/lib/viewer";

const YEAR_SECONDS = 60 * 60 * 24 * 400;

function isPublicCard(pathname: string) {
  return pathname.startsWith("/c/") || pathname.startsWith("/@");
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

  // Server refresh lives here. The browser refreshes only while its tab is visible.
  await supabase.auth.getUser();

  rememberViewer(supabaseResponse, request, viewer.id, viewer.fresh);
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
