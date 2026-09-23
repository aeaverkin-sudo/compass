"use client";

import { cn } from "@/lib/utils";

type CardNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  fontSizePx: number;
  placeholder?: string;
  className?: string;
};

export function CardNameField({
  value,
  onChange,
  fontSizePx,
  placeholder = "name, portfolio title",
  className,
}: CardNameFieldProps) {
  return (
    <input
      type="text"
      name="displayName"
      data-card-content
      value={value}
      placeholder={placeholder}
      aria-label="Name or portfolio title"
      autoComplete="name"
      autoCapitalize="words"
      onChange={(event) => onChange(event.target.value)}
      onInput={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "compass-input w-full bg-transparent text-center font-light leading-[1.2] text-foreground outline-none placeholder:text-hint",
        className,
      )}
      style={{ fontSize: fontSizePx }}
    />
  );
}
