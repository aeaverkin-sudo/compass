"use client";

import { useEffect, type RefObject } from "react";

/** The gap Safari leaves between a focused row and the keyboard. */
export const KEYBOARD_GAP_PX = 8;
const KEYBOARD_MIN_PX = 80;

function isTextField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node.isContentEditable;
}

/** The nearest ancestor that scrolls, or the node itself when it is the scroller. */
function scrollerOf(node: HTMLElement): HTMLElement {
  let current: HTMLElement | null = node;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "overlay") return current;
    current = current.parentElement;
  }
  return node;
}

/**
 * Keep the focused row just above the keyboard and leave the sheet scrollable.
 * The same rule for the questionnaire, the portfolio, and the poster form.
 * Field rectangles are visual-viewport relative, so the visible bottom is `visualViewport.height`.
 */
export function bindKeyboardLift(anchor: HTMLElement): () => void {
  const scroller = scrollerOf(anchor);
  const viewport = window.visualViewport;
  let baseline = viewport?.height ?? window.innerHeight;
  let timer = 0;
  let pinning = false;
  let seenShift = 0;

  const inset = () => {
    const next = window.visualViewport;
    if (!next) return 0;
    return Math.max(0, Math.round(baseline - next.height));
  };

  const place = (lift: boolean) => {
    if (pinning) return;
    const next = window.visualViewport;
    const field = document.activeElement;
    const mine = isTextField(field) && scroller.contains(field);
    const shift = next?.offsetTop ?? 0;
    if (shift > 1 || window.scrollY > 0) {
      const delta = shift - seenShift;
      seenShift = shift;
      pinning = true;
      window.scrollTo(0, 0);
      if (mine && delta > 1) scroller.scrollTop += delta;
      pinning = false;
    } else {
      seenShift = 0;
    }
    const height = inset();
    if (!mine || height < KEYBOARD_MIN_PX) {
      if (next && height < KEYBOARD_MIN_PX) baseline = next.height;
      scroller.style.paddingBottom = "";
      return;
    }
    scroller.style.paddingBottom = `${height}px`;
    if (!lift || !next) return;
    const covered = field.getBoundingClientRect().bottom - (next.height - KEYBOARD_GAP_PX);
    if (covered > 2) scroller.scrollTop += covered;
  };

  const onFocus = (event: FocusEvent) => {
    if (!isTextField(event.target) || !scroller.contains(event.target as Node)) return;
    if (inset() < KEYBOARD_MIN_PX) baseline = window.visualViewport?.height ?? baseline;
    window.clearTimeout(timer);
    place(true);
    timer = window.setTimeout(() => place(true), 320);
  };

  scroller.addEventListener("focusin", onFocus);
  const onResize = () => place(true);
  const onViewportScroll = () => place(false);
  viewport?.addEventListener("resize", onResize);
  viewport?.addEventListener("scroll", onViewportScroll);

  return () => {
    scroller.removeEventListener("focusin", onFocus);
    viewport?.removeEventListener("resize", onResize);
    viewport?.removeEventListener("scroll", onViewportScroll);
    window.clearTimeout(timer);
    scroller.style.paddingBottom = "";
  };
}

export function useKeyboardLift(anchorRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    return bindKeyboardLift(anchor);
  }, [anchorRef]);
}
