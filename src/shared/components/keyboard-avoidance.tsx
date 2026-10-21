"use client";

import { useEffect } from "react";

function isField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return true;
  return node.isContentEditable;
}

/** The nearest box that can scroll this field. The window is left alone. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

const KEYBOARD_MIN_PX = 80;
const GAP_PX = 8;

type Held = { scroller: HTMLElement | null };

function clearHeld(held: Held) {
  if (held.scroller) {
    held.scroller.style.paddingBottom = "";
    held.scroller.style.scrollPaddingBottom = "";
  }
  held.scroller = null;
}

function rowOf(el: HTMLElement) {
  return (
    el.closest<HTMLElement>("[data-seed-zone]") ??
    el.closest<HTMLElement>("[data-item-row], [data-seed-value]") ??
    el
  );
}

/**
 * The portfolio lift: a row the keyboard covers moves up until it sits above it.
 * A row the keyboard does not reach stays where it is.
 */
function place(el: HTMLElement, held: Held) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const keyboard = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
  const open = keyboard > KEYBOARD_MIN_PX;
  const scroller = scrollParent(el);
  if (held.scroller && held.scroller !== scroller) {
    held.scroller.style.paddingBottom = "";
    held.scroller.style.scrollPaddingBottom = "";
  }
  held.scroller = scroller;
  const keyboardPx = `${Math.round(keyboard)}px`;
  if (scroller) {
    scroller.style.paddingBottom = open ? keyboardPx : "";
    scroller.style.scrollPaddingBottom = open ? keyboardPx : "";
  }
  if (el.hasAttribute("data-keep-window") || !open || !scroller) return;
  const row = rowOf(el);
  const visibleBottom = viewport.offsetTop + viewport.height;
  const bottomLimit = Math.min(visibleBottom, scroller.getBoundingClientRect().bottom) - GAP_PX;
  const rect = row.getBoundingClientRect();
  const covered = rect.bottom - bottomLimit;
  if (covered < 2) return;
  scroller.scrollTop += covered;
}

export function KeyboardAvoidance() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    const held: Held = { scroller: null };
    let followUp = 0;
    let later = 0;
    let settled = 0;

    const run = () => {
      if (!active || !document.contains(active)) return;
      place(active, held);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      active = event.target;
      run();
      window.cancelAnimationFrame(followUp);
      followUp = requestAnimationFrame(run);
      window.clearTimeout(later);
      window.clearTimeout(settled);
      later = window.setTimeout(run, 320);
      settled = window.setTimeout(run, 700);
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        const next = document.activeElement;
        if (isField(next)) {
          active = next;
          return;
        }
        active = null;
        clearHeld(held);
      }, 60);
    };

    const onViewport = () => {
      if (active) run();
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.cancelAnimationFrame(followUp);
      window.clearTimeout(later);
      window.clearTimeout(settled);
      clearHeld(held);
    };
  }, []);

  return null;
}
