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

const KEYBOARD_MIN_PX = 80;
const GAP_PX = 8;

type Held = { scroller: HTMLElement | null; row: HTMLElement | null };

function clearHeld(held: Held) {
  if (held.scroller) {
    held.scroller.style.paddingTop = "";
    held.scroller.style.paddingBottom = "";
    held.scroller.style.scrollPaddingTop = "";
    held.scroller.style.scrollPaddingBottom = "";
  }
  if (held.row) {
    held.row.style.scrollMarginTop = "";
    held.row.style.scrollMarginBottom = "";
  }
  held.scroller = null;
  held.row = null;
}

function rowOf(el: HTMLElement) {
  return el.closest<HTMLElement>("[data-item-row], [data-seed-value]") ?? el;
}

/** How much a sticky or fixed bar covers the top of the scrolling list. */
function stickyCover(scroller: HTMLElement) {
  const box = scroller.getBoundingClientRect();
  if (box.width < 8 || box.height < 8) return 0;
  const x = Math.min(window.innerWidth - 2, Math.max(2, box.left + 12));
  let y = Math.max(0, box.top + 1);
  let cover = 0;
  for (let step = 0; step < 5; step += 1) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) break;
    let sticky = false;
    let node: Element | null = hit;
    while (node && node !== scroller) {
      const position = getComputedStyle(node).position;
      if (position === "sticky" || position === "fixed") sticky = true;
      node = node.parentElement;
    }
    if (!sticky) break;
    const bottom = hit.getBoundingClientRect().bottom;
    if (bottom <= y + 1) break;
    cover = Math.max(cover, bottom - box.top);
    y = bottom + 1;
    if (y >= box.bottom) break;
  }
  return cover;
}

/**
 * Puts the focused row on the keyboard.
 * The keyboard is the part of the layout the visual viewport no longer shows.
 * A row already on screen is not pulled up under the name: it stays at the bottom of the open area.
 */
function place(el: HTMLElement, held: Held) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const keyboard = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
  const open = keyboard > KEYBOARD_MIN_PX;
  const scroller = scrollParent(el);
  const row = rowOf(el);
  const cover = scroller ? stickyCover(scroller) : 0;
  if (held.scroller && held.scroller !== scroller) {
    held.scroller.style.paddingTop = "";
    held.scroller.style.paddingBottom = "";
    held.scroller.style.scrollPaddingTop = "";
    held.scroller.style.scrollPaddingBottom = "";
  }
  if (held.row && held.row !== row) {
    held.row.style.scrollMarginTop = "";
    held.row.style.scrollMarginBottom = "";
  }
  held.scroller = scroller;
  held.row = row;
  const keyboardPx = `${Math.round(keyboard)}px`;
  const coverPx = cover > 0 ? `${Math.round(cover)}px` : "";
  if (scroller) {
    scroller.style.paddingBottom = open ? keyboardPx : "";
    scroller.style.scrollPaddingBottom = open ? keyboardPx : "";
    scroller.style.scrollPaddingTop = coverPx;
  }
  row.style.scrollMarginTop = coverPx;
  row.style.scrollMarginBottom = open ? `${GAP_PX}px` : "";
  if (!open) {
    if (scroller) scroller.style.paddingTop = "";
    return;
  }
  if (scroller) scroller.style.paddingTop = "";
  // The name sits in the header. Scrolling the window to it is what drops the caret into the zones.
  if (el.hasAttribute("data-keep-window")) return;
  row.scrollIntoView({ block: "nearest", inline: "nearest" });
  const visibleBottom = viewport.offsetTop + viewport.height;
  const scrollerBottom = scroller ? scroller.getBoundingClientRect().bottom : visibleBottom;
  const bottomLimit = Math.min(visibleBottom, scrollerBottom) - GAP_PX;
  const topLimit = (scroller ? scroller.getBoundingClientRect().top : viewport.offsetTop) + cover + GAP_PX;
  const rect = row.getBoundingClientRect();
  let delta = bottomLimit - rect.bottom;
  const fits = rect.height <= bottomLimit - topLimit;
  if (fits && rect.top + delta < topLimit) delta = topLimit - rect.top;
  if (Math.abs(delta) < 2) return;
  if (!scroller) {
    window.scrollBy(0, -delta);
    return;
  }
  if (delta > 0) {
    const byScroll = Math.min(scroller.scrollTop, delta);
    scroller.scrollTop -= byScroll;
    const next = delta - byScroll;
    scroller.style.paddingTop = next > 2 ? `${Math.round(next)}px` : "";
    return;
  }
  scroller.scrollTop += -delta;
}

export function KeyboardAvoidance() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    const held: Held = { scroller: null, row: null };
    let followUp = 0;
    let later = 0;

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
      later = window.setTimeout(run, 320);
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
      clearHeld(held);
    };
  }, []);

  return null;
}
