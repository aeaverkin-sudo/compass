"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useAppStore } from "@/shared/store/app-store";

const KEY = "compass.resume-route";

/** Working screens: an iOS home screen app reopened from `/` comes back to them. */
const RESUMABLE = [/^\/e\/[^/]+\/manage(\/.*)?$/, /^\/network(\/.*)?$/, /^\/profile$/, /^\/account\/.+$/];

type Saved = { path: string; user: string; ts: number };

function resumable(pathname: string): boolean {
  return RESUMABLE.some((pattern) => pattern.test(pathname));
}

function read(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    return saved && typeof saved.path === "string" && typeof saved.user === "string" ? (saved as Saved) : null;
  } catch {
    return null;
  }
}

function clear() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

async function sessionUserId(): Promise<string | null> {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  return data.session?.user.id ?? null;
}

async function save() {
  const { pathname, search } = window.location;
  if (!resumable(pathname)) return;
  const user = await sessionUserId();
  if (!user) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path: `${pathname}${search}`, user, ts: Date.now() }));
  } catch {}
}

/** One decision per launch: the first path of this page load, and where the restore went. */
const launch: { path: string | null; decided: boolean; target: string | null } = { path: null, decided: false, target: null };

function coldStart(path: string | null): boolean {
  return path === "/" || path === "/main";
}

/**
 * Keeps the last working screen and returns to it when the app starts again on `/` or `/main`.
 * Going to Main on purpose forgets it.
 */
export function ResumeRoute() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    if (launch.path === null) {
      launch.path = pathname;
      if (!coldStart(pathname)) launch.decided = true;
    }
    if (launch.target) {
      if (coldStart(pathname)) return;
      const arrived = launch.target.split("?")[0] === pathname;
      launch.target = null;
      if (arrived) return;
    }
    if (!launch.decided) return;
    if (resumable(pathname)) void save();
    else if (coldStart(pathname)) clear();
  }, [pathname]);

  useEffect(() => {
    const hide = () => {
      if (launch.decided && !launch.target) void save();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
    };
  }, []);

  useEffect(() => {
    if (launch.decided || !hydrated || !sessionReady) return;
    if (needsSignIn || !onboarded) {
      launch.decided = true;
      return;
    }
    const saved = read();
    if (!saved) {
      launch.decided = true;
      return;
    }
    let cancelled = false;
    void sessionUserId().then((user) => {
      if (cancelled || launch.decided) return;
      launch.decided = true;
      if (user !== saved.user || !resumable(saved.path.split("?")[0])) {
        clear();
        return;
      }
      launch.target = saved.path;
      router.replace(saved.path);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionReady, needsSignIn, onboarded, router]);

  return null;
}
