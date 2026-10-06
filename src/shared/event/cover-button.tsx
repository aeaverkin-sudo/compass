"use client";

import { useEffect, useState } from "react";
import { InviteCover, type InviteCoverEvent } from "@/shared/event/invite-cover";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";

/** Tap the cover to open it full size. Close sits at the top left; a tap or Escape also closes. */
export function CoverButton({
  event,
  layout,
  themeId,
  variant = "card",
  className,
}: {
  event: InviteCoverEvent;
  layout: EventLayoutId;
  themeId: EventThemeId;
  variant?: "card" | "square" | "preview";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`press block w-full border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent] ${className ?? ""}`}
      >
        <InviteCover variant={variant} layout={layout} themeId={themeId} event={event} />
      </button>
      {open ? (
        <div
          role="presentation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] overflow-y-auto [-webkit-tap-highlight-color:transparent]"
          style={{ background: `var(--event-theme-${themeId})`, color: `var(--event-theme-${themeId}-ink)` }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="press fixed z-[81] border-0 bg-transparent p-0 t-body [-webkit-tap-highlight-color:transparent]"
            style={{ top: "calc(env(safe-area-inset-top) + 12px)", left: "var(--gutter)", color: "inherit" }}
          >
            Close
          </button>
          <InviteCover variant="page" layout={layout} themeId={themeId} event={event} />
        </div>
      ) : null}
    </>
  );
}
