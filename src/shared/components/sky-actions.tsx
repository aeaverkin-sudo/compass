"use client";

import { cn } from "@/lib/utils";

export type SkyAction = {
  label: string;
  tone: "ink" | "grey" | "danger";
  onPress: () => void;
  disabled?: boolean;
};

/** The sky bar for a hold. Two words, each centered in its half. A bottom band is TabBand. */
export function SkyActions({ actions }: { actions: SkyAction[] }) {
  return (
    <div className="flex bg-sky">
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
