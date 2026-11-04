"use client";

import { memo, useRef, type ComponentProps, type PointerEvent } from "react";
import { REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import { useNetworkDot } from "@/shared/lib/network-dot";
import { TabBand } from "./tab-band";

/** Fires on the finger lifting; the click Safari sends after it is dropped, keyboard clicks still work. */
function TapButton({ onTap, ...props }: Omit<ComponentProps<"button">, "onClick" | "onPointerUp"> & { onTap: () => void }) {
  return (
    <button
      type="button"
      {...props}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        onTap();
      }}
      onClick={(event) => {
        if (event.detail === 0) onTap();
      }}
    />
  );
}

type BottomNavProps = {
  /** Edit mode: Reset or Delete on the left, Save on the right. The new-section plus sits in the portfolio. */
  editing?: boolean;
  /** The edited portfolio is the first one: the left word reads Reset, else Delete. */
  resetsCard?: boolean;
  onRemove?: () => void;
  onEdit: () => void;
  onAdd?: () => void;
  onDone?: () => void;
  onNetwork?: () => void;
  onProfile?: () => void;
};

export const BottomNav = memo(function BottomNav({
  editing = false,
  resetsCard = false,
  onRemove,
  onEdit,
  onDone,
  onNetwork,
  onProfile,
}: BottomNavProps) {
  const editOrigin = useRef<{ x: number; y: number } | null>(null);
  const networkDot = useNetworkDot();

  const onEditPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    editOrigin.current = { x: event.clientX, y: event.clientY };
    window.getSelection()?.removeAllRanges();
  };

  const onEditPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = editOrigin.current;
    editOrigin.current = null;
    if (!start) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > REORDER_SLOP_PX * REORDER_SLOP_PX) return;
    onEdit();
  };

  return (
    <TabBand
      left={
        editing ? (
          <TapButton
            className="flex h-full min-h-11 w-full items-center uppercase"
            onTap={() => onRemove?.()}
          >
            {resetsCard ? "Reset" : "Delete"}
          </TapButton>
        ) : (
          <TapButton
            className="flex h-full min-h-11 w-full items-center uppercase"
            onTap={() => onProfile?.()}
          >
            Profile
          </TapButton>
        )
      }
      center={
        editing ? (
          <span className="min-h-11 w-full" />
        ) : (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center justify-center uppercase"
            onPointerDown={onEditPointerDown}
            onPointerUp={onEditPointerUp}
            onPointerCancel={() => {
              editOrigin.current = null;
            }}
            onClick={(event) => {
              if (event.detail === 0) onEdit();
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            Edit
          </button>
        )
      }
      right={
        editing ? (
          <TapButton
            className="flex h-full min-h-11 w-full items-center justify-end uppercase"
            onTap={() => onDone?.()}
          >
            Save
          </TapButton>
        ) : (
          <TapButton
            className="flex h-full min-h-11 w-full items-center justify-end uppercase"
            onTap={() => onNetwork?.()}
          >
            <span className="relative">
              Network
              {networkDot ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-0 right-0 rounded-full bg-[var(--event-theme-orange)]"
                  style={{
                    width: "calc(0.375rem * 0.95)",
                    height: "calc(0.375rem * 0.95)",
                    transform: "translate(50%, calc(-50% - 4px))",
                  }}
                />
              ) : null}
            </span>
          </TapButton>
        )
      }
    />
  );
});
