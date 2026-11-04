"use client";

import { cn } from "@/lib/utils";

export type SkyAction = {
  label: string;
  tone: "ink" | "grey" | "danger";
  onPress: () => void;
  disabled?: boolean;
};

/** The sky bar for a hold and for a docked row. Two words, each centered in its half. */
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
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
