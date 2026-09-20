"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type CardNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  fontSizePx: number;
  placeholder?: string;
  className?: string;
  onEditingChange?: (editing: boolean) => void;
};

export function CardNameField({
  value,
  onChange,
  fontSizePx,
  placeholder = "name, portfolio title",
  className,
  onEditingChange,
}: CardNameFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);

  const setEditingState = (next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  };

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
  }, [editing]);

  useEffect(
    () => () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  const commitAndClose = () => {
    const next = inputRef.current?.value ?? draft;
    onChange(next);
    setEditingState(false);
  };

  const scheduleBlurCommit = () => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      if (document.activeElement === inputRef.current) return;
      commitAndClose();
    }, 180);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        name="displayName"
        data-card-content
        value={draft}
        placeholder={placeholder}
        aria-label="Name or portfolio title"
        autoComplete="name"
        autoCapitalize="words"
        onChange={(event) => setDraft(event.target.value)}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onBlur={scheduleBlurCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            commitAndClose();
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
    <button
      type="button"
      data-card-content
      aria-label="Edit name or portfolio title"
      onClick={(event) => {
        event.stopPropagation();
        setDraft(value);
        setEditingState(true);
      }}
      className={cn(
        "w-full bg-transparent text-center font-normal leading-[1.12]",
        value.trim() ? "text-foreground" : "text-hint",
        className,
      )}
      style={{ fontSize: fontSizePx }}
    >
      {value.trim() || placeholder}
    </button>
  );
}
