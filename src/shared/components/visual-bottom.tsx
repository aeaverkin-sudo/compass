"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { writeScreenVars } from "@main/layout";
import { publicBandHost, publicBandLiftPx } from "@/shared/lib/in-app-browser";

/**
 * The head script has already sized the shell. This repeats that measure
 * after navigation and when the visible viewport moves, and keeps the public
 * band clear of a browser bar the viewport does not report.
 * The band stays hidden until this runs, which is before the first paint.
 */
export function VisualBottom() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const write = () => {
      frame = 0;
      writeScreenVars();
      const measured = Number.parseFloat(root.style.getPropertyValue("--vv-bottom"));
      const lift = Math.max(publicBandLiftPx(publicBandHost()), Number.isFinite(measured) ? measured : 0);
      root.style.setProperty("--band-safe", `${Math.round(lift)}px`);
      root.classList.add("compass-band-ready");
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("resize", schedule);
    return () => {
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
