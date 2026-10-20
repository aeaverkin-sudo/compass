"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clampNameLines } from "@/shared/components/name-or-title-field";

/** One letter starts here; from the third it shrinks to the name column. */
const HERO_NAME_MAX_PX = 78;
/** Clear space after the descenders, before the role. */
const HERO_ROLE_GAP_PX = 4;
/**
 * Ink of g/y/p below a line-height of 1.
 * Helvetica Neue 600, "greg" at 78px: the tail ends 7px under the line box.
 */
const HERO_DESCENDER_OVERFLOW = 0.09;

function splitHeroLines(name: string, maxLines: number) {
  const parts = name.split("\n");
  if (parts.length === 1) return [name];
  return [...parts.slice(0, maxLines - 1), parts.slice(maxLines - 1).join("")];
}

/** Keeps the first lines and joins the rest into the last one. */
export function clampHeroLines(value: string, maxLines: number) {
  const parts = value.split("\n");
  if (parts.length <= maxLines) return value;
  return [...parts.slice(0, maxLines - 1), parts.slice(maxLines - 1).join(" ")].join("\n");
}

function textWidth(text: string, size: number, weight: number) {
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = `position:absolute;left:-9999px;white-space:nowrap;font-family:${getComputedStyle(document.body).fontFamily};font-weight:${weight};font-size:${size}px;line-height:1;letter-spacing:${weight === 600 ? "-1px" : "0px"}`;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

function fitToWidth(text: string, width: number, weight: number, max: number, min: number) {
  if (!width) return min;
  let lo = min;
  let hi = max;
  for (let step = 0; step < 14; step += 1) {
    const mid = (lo + hi) / 2;
    if (textWidth(text, mid, weight) <= width) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function HeroName({
  value,
  onChange,
  roleBelow,
  placeholder = "Name or portfolio title",
  maxLines = 2,
  align = "bottom",
  pending = false,
  onFocus,
}: {
  value: string;
  onChange?: (displayName: string) => void;
  /** Reserve the descender and a gap so the role sits clear of g, y, p. */
  roleBelow?: boolean;
  placeholder?: string;
  maxLines?: number;
  /** Offered text stays grey until the caret is placed. */
  pending?: boolean;
  onFocus?: () => void;
  /** Center puts the lines themselves, without the descender pad, on the middle of the photo. */
  align?: "bottom" | "center";
}) {
  const centered = align === "center";
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(16);
  const [wrapWord, setWrapWord] = useState(false);
  const lines = splitHeroLines(value, maxLines);
  const empty = value.length === 0;
  const broken = value.includes("\n");
  const twoLines = broken || wrapWord;
  const lineCount = broken ? lines.length : wrapWord ? 2 : 1;
  const clamp = (next: string) => (maxLines === 2 ? clampNameLines(next) : clampHeroLines(next, maxLines));
  const full = value.split("\n").length >= maxLines;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const width = box.clientWidth;
      if (!value) {
        setWrapWord(false);
        const lines = placeholder.split("\n").filter((line) => line.length > 0);
        const fitted = (lines.length > 0 ? lines : [placeholder]).reduce(
          (tightest, line) => Math.min(tightest, fitToWidth(line, Math.max(0, width - 4), 400, 19, 8)),
          19,
        );
        setSize(fitted);
        return;
      }
      const parts = splitHeroLines(value, maxLines);
      const measured = value.includes("\n") ? parts.filter((line) => line.length > 0) : [value];
      const count = value.includes("\n") ? parts.length : 1;
      const widthSize = measured.reduce(
        (tightest, line) => Math.min(tightest, fitToWidth(line, Math.max(0, width - 2), 600, HERO_NAME_MAX_PX, 8)),
        HERO_NAME_MAX_PX,
      );
      const gap = roleBelow ? HERO_ROLE_GAP_PX : 0;
      const heightSize = Math.max(8, (box.clientHeight - gap) / (count + HERO_DESCENDER_OVERFLOW));
      setWrapWord(false);
      setSize(Math.min(HERO_NAME_MAX_PX, widthSize, heightSize));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    const onTurn = () => fit();
    window.addEventListener("orientationchange", onTurn);
    void document.fonts?.ready.then(fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", onTurn);
    };
  }, [maxLines, placeholder, roleBelow, value]);

  const descender = size * HERO_DESCENDER_OVERFLOW;
  const rolePad = descender + (roleBelow ? HERO_ROLE_GAP_PX : 0);
  const placeholderLines = placeholder.split("\n");
  const lineStyle = {
    fontSize: size,
    lineHeight: 1,
    fontWeight: empty ? 400 : 600,
    letterSpacing: empty ? "0px" : "-1px",
    boxSizing: "border-box" as const,
    height: size * (empty ? placeholderLines.length : lineCount) + rolePad,
    paddingBottom: rolePad,
    ...(centered ? { marginBottom: -rolePad } : {}),
  };

  return (
    <div
      ref={boxRef}
      data-card-content
      className={cn(
        "relative flex min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-visible",
        centered ? "items-center" : "items-end",
      )}
    >
      {onChange ? (
        <>
        {empty ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-0 whitespace-pre border-b-[0.5px] border-[#D0D0D0] pb-px text-[var(--placeholder)]",
              centered && "top-1/2 -translate-y-1/2",
            )}
            style={{ fontSize: size, fontWeight: 400, lineHeight: 1, bottom: centered ? undefined : descender }}
          >
            {placeholder}
          </span>
        ) : null}
        <textarea
          value={value}
          rows={maxLines}
          enterKeyHint="enter"
          placeholder=""
          aria-label={placeholder}
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          data-no-swipe
          onChange={(event) => {
            onChange(clamp(event.target.value));
          }}
          onFocus={(event) => {
            onFocus?.();
            event.currentTarget.scrollIntoView({ block: "nearest" });
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onBeforeInput={(event) => {
            const native = event.nativeEvent;
            if (native.inputType !== "insertLineBreak") return;
            event.preventDefault();
            event.stopPropagation();
            if (full) return;
            const start = event.currentTarget.selectionStart ?? value.length;
            const end = event.currentTarget.selectionEnd ?? start;
            onChange(clamp(`${value.slice(0, start)}\n${value.slice(end)}`));
          }}
          onKeyDownCapture={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (full) return;
            const start = event.currentTarget.selectionStart ?? value.length;
            const end = event.currentTarget.selectionEnd ?? start;
            onChange(clamp(`${value.slice(0, start)}\n${value.slice(end)}`));
          }}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "compass-input m-0 block w-full max-h-full min-h-0 resize-none overflow-x-hidden overflow-y-visible bg-transparent p-0 text-left whitespace-pre outline-none",
            pending ? "text-[var(--placeholder)] caret-[var(--ink)]" : "text-[var(--ink)]",
          )}
          style={empty ? { ...lineStyle, color: "transparent", caretColor: "var(--ink)" } : lineStyle}
        />
        </>
      ) : (
        <div
          className={cn(
            "w-full overflow-x-hidden overflow-y-visible text-left text-[var(--ink)]",
            wrapWord ? "whitespace-pre-wrap break-all" : "whitespace-nowrap",
          )}
          style={lineStyle}
        >
          {empty ? (
            <div className="whitespace-pre border-b-[0.5px] border-[#D0D0D0] pb-px text-[var(--placeholder)]">{placeholder}</div>
          ) : twoLines ? (
            lines.map((line, index) => (
              <div key={index} className="whitespace-nowrap">
                {line || "\u00a0"}
              </div>
            ))
          ) : (
            <div className="whitespace-nowrap">{value}</div>
          )}
        </div>
      )}
    </div>
  );
}
