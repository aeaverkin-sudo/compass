"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROUTES = ["/main", "/profile", "/network", "/network/data", "/network/event"];

/** Load the tab routes with the shell, so the first tap does not wait for the chunk. */
export function TabPrefetch() {
  const router = useRouter();

  useEffect(() => {
    for (const href of ROUTES) router.prefetch(href);
  }, [router]);

  return null;
}
