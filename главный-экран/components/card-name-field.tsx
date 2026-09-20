"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";

const LONG_PRESS_MS = 800;
const DOUBLE_TAP_MS = 300;

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
  const lastTapAt = useRef(0);
  const longPressJustFired = useRef(false);

  const beginEdit = useCallback(() => {
    setEditing(true);
  }, []);

  const longPress = useLongPress(() => {
    longPressJustFired.current = true;
    beginEdit();
  }, LONG_PRESS_MS);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const handlePointerUp = (event: React.PointerEvent<HTMLParagraphElement>) => {
    longPress.onPointerUp();

    if (longPressJustFired.current) {
      longPressJustFired.current = false;
      return;
    }

    const now = Date.now();
    if (now - lastTapAt.current <= DOUBLE_TAP_MS) {
      lastTapAt.current = 0;
      beginEdit();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    lastTapAt.current = now;
  };

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
      aria-label="Double tap or hold to edit name"
      className={cn(
        "compass-press font-normal leading-[1.12] select-none",
        value.trim() ? "text-foreground" : "text-hint",
        className,
      )}
      style={{ fontSize: fontSizePx }}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onPointerLeave={longPress.onPointerLeave}
      onClick={longPress.onClick}
      onContextMenu={longPress.onContextMenu}
    >
      {value.trim() || placeholder}
    </p>
  );
}
