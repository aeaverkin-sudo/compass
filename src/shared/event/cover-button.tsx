"use client";

import { useEffect, useState } from "react";
import { InviteCover, type InviteCoverEvent } from "@/shared/event/invite-cover";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";

/** Tap the cover to open the poster itself, centered on a neutral field. Close or Escape dismisses it. */
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
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="press fixed z-[81] border-0 bg-transparent p-0 t-body text-white [-webkit-tap-highlight-color:transparent]"
            style={{ top: "calc(env(safe-area-inset-top) + 12px)", left: "var(--gutter)" }}
          >
            Close
          </button>
          <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-3 py-16">
            <div className="m-auto w-full" onClick={(event) => event.stopPropagation()}>
              <InviteCover variant="full" layout={layout} themeId={themeId} event={event} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
