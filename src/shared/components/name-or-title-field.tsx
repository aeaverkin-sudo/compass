"use client";

import { cn } from "@/lib/utils";

type NameOrTitleFieldProps = {
  value: string;
  onChange: (value: string) => void;
  fontSizePx?: number;
  className?: string;
};

export function clampNameLines(value: string) {
  const parts = value.split("\n");
  if (parts.length <= 2) return value;
  return `${parts[0]}\n${parts.slice(1).join(" ")}`;
}

export function NameOrTitleField({
  value,
  onChange,
  fontSizePx = 17,
  className,
}: NameOrTitleFieldProps) {
  const twoLines = value.includes("\n");

  return (
    <textarea
      name="displayName"
      data-card-content
      rows={twoLines ? 2 : 1}
      value={value}
      placeholder="Name or portfolio title"
      aria-label="Name or portfolio title"
      autoComplete="name"
      autoCapitalize="words"
      autoCorrect="off"
      spellCheck={false}
      onChange={(event) => onChange(clampNameLines(event.target.value))}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (value.includes("\n")) return;
        const start = event.currentTarget.selectionStart ?? value.length;
        const end = event.currentTarget.selectionEnd ?? start;
        onChange(clampNameLines(`${value.slice(0, start)}\n${value.slice(end)}`));
      }}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "compass-input block w-full resize-none overflow-hidden bg-transparent leading-[1.15] text-foreground outline-none placeholder:text-hint",
        className,
      )}
      style={{ fontSize: fontSizePx, height: twoLines ? "2.3em" : "1.15em" }}
    />
  );
}
