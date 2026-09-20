"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";

const LONG_PRESS_MS = 800;

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
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const longPress = useLongPress(() => {
    setEditing(true);
  }, LONG_PRESS_MS);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        data-card-content
        value={value}
        placeholder={placeholder}
        aria-label="Name or portfolio title"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            inputRef.current?.blur();
          }
        }}
        className={cn(
          "compass-input w-full bg-transparent text-center font-normal leading-[1.12] text-foreground outline-none placeholder:text-hint",
          className,
        )}
        style={{ fontSize: fontSizePx }}
      />
    );
  }

  return (
    <p
      data-card-content
      aria-label="Hold to edit name"
      className={cn(
        "compass-press font-normal leading-[1.12] select-none",
        value.trim() ? "text-foreground" : "text-hint",
        className,
      )}
      style={{ fontSize: fontSizePx }}
      {...longPress}
    >
      {value.trim() || placeholder}
    </p>
  );
}
