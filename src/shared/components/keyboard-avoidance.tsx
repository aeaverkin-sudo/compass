"use client";

import { useEffect } from "react";

function isField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return true;
  return node.isContentEditable;
}

/** The nearest box that can scroll this field. The window is left alone so iOS does not jump the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Keeps the focused field in the visible band above the keyboard.
 * The inset is the part of the layout the visual viewport no longer shows.
 */
function place(el: HTMLElement, padded: { current: HTMLElement | null }) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const visibleBottom = viewport.offsetTop + viewport.height;
  const scroller = scrollParent(el);
  const covered = scroller
    ? scroller.getBoundingClientRect().bottom - visibleBottom
    : window.innerHeight - visibleBottom;
  const inset = Math.max(0, covered);
  const open = inset > 80;
  if (padded.current && padded.current !== scroller) padded.current.style.paddingBottom = "";
  padded.current = scroller;
  if (scroller) scroller.style.paddingBottom = open ? `${Math.round(inset + 16)}px` : "";
  if (!open) return;
  const rect = el.getBoundingClientRect();
  const topLimit = viewport.offsetTop + 12;
  const bottomLimit = visibleBottom - 12;
  if (rect.bottom <= bottomLimit && rect.top >= topLimit) return;
  const mid = (topLimit + bottomLimit) / 2;
  const delta = rect.top + rect.height / 2 - mid;
  if (Math.abs(delta) < 8) return;
  if (scroller) scroller.scrollTop += delta;
  else window.scrollBy(0, delta);
}

export function KeyboardAvoidance() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    const padded = { current: null as HTMLElement | null };
    let followUp = 0;

    const run = () => {
      if (!active || !document.contains(active)) return;
      place(active, padded);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      active = event.target;
      run();
      window.cancelAnimationFrame(followUp);
      followUp = requestAnimationFrame(run);
      window.setTimeout(run, 320);
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        const next = document.activeElement;
        if (isField(next)) {
          active = next;
          return;
        }
        active = null;
        if (padded.current) padded.current.style.paddingBottom = "";
        padded.current = null;
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
      if (padded.current) padded.current.style.paddingBottom = "";
    };
  }, []);

  return null;
}
