"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { writeScreenVars } from "@main/layout";

/**
 * The head script has already sized the shell. This repeats that measure
 * after navigation and when the visible viewport moves.
 * The band stays hidden until this runs, which is before the first paint.
 */
export function VisualBottom() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    // / and /main stay unsettled until the portfolio measures. Any other arrival releases motion.
    if (pathname !== "/" && pathname !== "/main" && !pathname.startsWith("/main/")) {
      root.classList.add("compass-settled");
    }
    let frame = 0;

    const write = () => {
      frame = 0;
      writeScreenVars();
      root.classList.add("compass-band-ready");
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const later = installed ? [window.setTimeout(write, 500), window.setTimeout(write, 2000)] : [];
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      later.forEach((timer) => window.clearTimeout(timer));
      if (frame) cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pathname]);

  return (
    <style>{`
      .compass-sky-band { visibility: hidden; transition: none; }
      html.compass-band-ready .compass-sky-band { visibility: visible; }
    `}</style>
  );
}
