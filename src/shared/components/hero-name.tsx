"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/** One letter starts here. Longer lines step down. Two lines never leave the photo box. */
const MAX_PX = 78;
const MIN_PX = 16;
/** Average Helvetica Neue 600 glyph, in em. Caps are wider than mixed case. */
const K_CAPS = 0.58;
const K_MIXED = 0.52;
/** Ink of g/y/p below a line-height of 1. */
const DESCENDER = 0.09;

function glyphK(text: string) {
  const letters = text.replace(/\s/g, "");
  if (!letters) return K_CAPS;
  return letters === letters.toUpperCase() ? K_CAPS : K_MIXED;
}

function clampLines(value: string, maxLines: number) {
  const parts = value.replace(/\r\n?/g, "\n").split("\n");
  if (parts.length <= maxLines) return parts.join("\n");
  return [...parts.slice(0, maxLines - 1), parts.slice(maxLines - 1).join(" ")].join("\n");
}

/** Font size and line count from the box and the text. No glyph is measured. */
function plan(text: string, width: number, height: number, maxLines: number) {
  const parts = clampLines(text, maxLines).split("\n");
  const written = parts.filter((line) => line.length > 0);
  const source = written.length > 0 ? written : [""];
  let count = Math.min(maxLines, Math.max(1, source.length));
  let longest = source.reduce((max, line) => Math.max(max, line.length), 1);
  const k = source.reduce((max, line) => Math.max(max, glyphK(line)), K_MIXED);
  if (count === 1 && width > 0 && maxLines >= 2 && width / (longest * k) < MIN_PX) {
    count = 2;
    longest = Math.max(1, Math.ceil(longest / 2));
  }
  const byWidth = width > 0 ? width / (longest * k) : MAX_PX;
  const byHeight = height > 0 ? height / (count + DESCENDER) : MAX_PX;
  const fontSize = Math.max(MIN_PX, Math.min(MAX_PX, byWidth, byHeight));
  return { count, fontSize };
}

export function HeroName({
  value,
  onChange,
  pending = false,
  placeholder = "NAME, COMPANY\nOR PORTFOLIO TITLE",
  maxLines = 2,
  align = "bottom",
  roleBelow: _roleBelow = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  /** Offered text stays grey until the first edit. */
  pending?: boolean;
  placeholder?: string;
  maxLines?: number;
  align?: "bottom" | "center";
  /** The role under the name sits outside this box. Kept so the card call stays as it is. */
  roleBelow?: boolean;
}) {
  void _roleBelow;
  const [box, setBox] = useState({ w: 200, h: 128 });
  const onBox = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w < 8 || h < 8) return;
      setBox((current) => (current.w === w && current.h === h ? current : { w, h }));
    };
    measure();
    const onTurn = () => measure();
    window.addEventListener("orientationchange", onTurn);
    return () => window.removeEventListener("orientationchange", onTurn);
  }, []);

  const empty = value.length === 0;
  const shown = empty ? `${placeholder} *` : value;
  const { count, fontSize } = plan(shown, box.w, box.h, maxLines);
  const height = count * fontSize + fontSize * DESCENDER;
  const lastPlaceholder = placeholder.split("\n").at(-1) ?? "";
  const starAt = lastPlaceholder.length * fontSize * K_CAPS;

  const typeStyle = {
    fontSize,
    lineHeight: 1,
    fontWeight: empty ? 400 : 600,
    letterSpacing: empty ? "0px" : "-1px",
    height,
    maxHeight: "100%",
  };

  return (
    <div
      ref={onBox}
      data-card-content
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 overflow-hidden",
        align === "center" ? "items-center" : "items-end",
      )}
    >
      {onChange ? (
        <>
          <textarea
            value={value}
            placeholder={placeholder}
            aria-label={placeholder.replace("\n", " ")}
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            data-no-swipe
            onChange={(event) => onChange(clampLines(event.target.value, maxLines))}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDownCapture={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (value.split("\n").length >= maxLines) return;
              const start = event.currentTarget.selectionStart ?? value.length;
              const end = event.currentTarget.selectionEnd ?? start;
              onChange(clampLines(`${value.slice(0, start)}\n${value.slice(end)}`, maxLines));
            }}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "compass-input m-0 block w-full resize-none overflow-hidden bg-transparent p-0 whitespace-pre-wrap outline-none [overflow-wrap:anywhere] placeholder:text-[var(--placeholder)]",
              pending ? "text-[var(--placeholder)] caret-[var(--ink)]" : "text-[var(--ink)]",
            )}
            style={typeStyle}
          />
          {empty ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute border-b-[0.5px] border-[#D0D0D0]"
                style={{ left: 0, bottom: 0, width: starAt }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute font-[inherit] leading-none text-[var(--placeholder)]"
                style={{ left: starAt, bottom: fontSize * DESCENDER, fontSize, fontWeight: 400 }}
              >
                <span className="relative -top-[0.35em] ml-[0.15em] text-[1em] leading-none">*</span>
              </span>
            </>
          ) : null}
        </>
      ) : (
        <div
          className="w-full overflow-hidden whitespace-pre-wrap text-left text-[var(--ink)] [overflow-wrap:anywhere]"
          style={typeStyle}
        >
          {clampLines(value, maxLines)}
        </div>
      )}
    </div>
  );
}
