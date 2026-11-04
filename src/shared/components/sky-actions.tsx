"use client";

import { BAND_ROW_PX } from "@main/layout";
import { cn } from "@/lib/utils";

export type SkyAction = {
  label: string;
  tone: "ink" | "grey" | "danger";
  onPress: () => void;
  disabled?: boolean;
};

const BUTTON =
  "press flex h-full min-h-11 w-full items-center whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] uppercase [-webkit-tap-highlight-color:transparent] disabled:text-[var(--grey)]";

function ActionButton({ action, align }: { action: SkyAction; align: "start" | "end" | "fill" }) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onPress}
      className={cn(
        BUTTON,
        align === "end" && "justify-end",
        align === "fill" && "min-h-11 flex-1 justify-center px-3 t-caps",
        action.tone === "grey" ? "text-[var(--grey)]" : "text-[var(--ink)]",
      )}
    >
      {action.label}
    </button>
  );
}

/** The sky bar for a hold. Two words sit on the Profile and Network edges. A docked row stays split in half. */
export function SkyActions({ actions, dock = false }: { actions: SkyAction[]; dock?: boolean }) {
  const spread = !dock && actions.length === 2 && actions.some((action) => /delete/i.test(action.label));
  if (spread) {
    return (
      <div className="bg-sky t-band text-[var(--ink)]">
        <div className="flex items-stretch" style={{ height: BAND_ROW_PX }}>
          <div className="flex min-w-0 flex-1 items-stretch">
            <ActionButton action={actions[0]} align="start" />
          </div>
          <div className="min-w-0 flex-1" />
          <div className="flex min-w-0 flex-1 items-stretch justify-end">
            <ActionButton action={actions[1]} align="end" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-sky" style={dock ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}>
      {actions.map((action) => (
        <ActionButton key={action.label} action={action} align="fill" />
      ))}
    </div>
  );
}
