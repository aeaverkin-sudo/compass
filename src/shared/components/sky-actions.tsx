"use client";

import { ENTRY_MARK } from "@/app/create/entry-zones";
import { cn } from "@/lib/utils";

export type SkyAction = {
  label: string;
  tone: "ink" | "grey" | "danger";
  onPress: () => void;
  disabled?: boolean;
};

/** The sky bar for a hold and for the bottom of an opened contact. Same row, no lines. */
export function SkyActions({ actions, dock = false }: { actions: SkyAction[]; dock?: boolean }) {
  return (
    <div className="flex bg-sky" style={dock ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={action.disabled}
          onClick={action.onPress}
          className={cn(
            "press min-h-11 flex-1 border-0 bg-transparent px-3 t-caps [-webkit-tap-highlight-color:transparent] disabled:text-[var(--grey)]",
            action.tone === "grey" ? "text-[var(--grey)]" : "text-[var(--ink)]",
          )}
          style={action.tone === "danger" && !action.disabled ? { color: ENTRY_MARK } : undefined}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
