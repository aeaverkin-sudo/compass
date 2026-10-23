"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { writeHeaderScale } from "@main/layout";

/**
 * Header scale after navigation and when the window changes.
 * The bar itself is a fixed row; it does not wait on a measurement.
 */
export function VisualBottom() {
  const pathname = usePathname();
  const [square, setSquare] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setSquare(standalone && (pathname === "/main" || pathname.startsWith("/main/")));
    // / and /main stay unsettled until the portfolio measures. Any other arrival releases motion.
    if (pathname !== "/" && pathname !== "/main" && !pathname.startsWith("/main/")) {
      root.classList.add("compass-settled");
    }
    let frame = 0;

    const write = () => {
      frame = 0;
      writeHeaderScale();
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

  if (!square) return null;

  return (
    <button
      type="button"
      aria-label="Square"
      className="fixed bottom-[6px] left-1/2 z-50 size-11 -translate-x-1/2 border-0 bg-sky p-0"
    />
  );
}
