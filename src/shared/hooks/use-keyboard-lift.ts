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
 * Safari does not include padding-bottom of the scrolling box in the scroll range,
 * so the extra room sits on the content inside it.
 */
export function bindKeyboardLift(anchor: HTMLElement): () => void {
  const scroller = scrollerOf(anchor);
  const padTarget = anchor !== scroller && getComputedStyle(anchor).display !== "contents" ? anchor : null;
  const viewport = window.visualViewport;
  let baseline = viewport?.height ?? window.innerHeight;
  let timer = 0;
  let follow = 0;
  let pinning = false;
  let retries = 0;
  let open = 0;

  const keyboardHeight = () => {
    const next = window.visualViewport;
    if (!next) return 0;
    const gap = Math.max(0, Math.round(baseline - next.height));
    const field = document.activeElement;
    const focused = isTextField(field) && scroller.contains(field);
    // A short change is the browser chrome. Keep the baseline through a focus blip
    // while the keyboard is opening, or the row never gets the full lift.
    if (gap < KEYBOARD_MIN_PX) {
      if (!focused) baseline = next.height;
      open = 0;
      return 0;
    }
    if (focused) open = gap;
    return open;
  };

  const applyRoom = (room: number) => {
    const px = room > 0 ? `${room}px` : "";
    if (padTarget) {
      padTarget.style.paddingBottom = px;
      return;
    }
    if (room > 0) {
      scroller.dataset.keyboardLift = "";
      scroller.style.setProperty("--keyboard-lift", px);
    } else {
      delete scroller.dataset.keyboardLift;
      scroller.style.removeProperty("--keyboard-lift");
    }
  };

  const place = (lift: boolean) => {
    if (pinning) return;
    const next = window.visualViewport;
    const field = document.activeElement;
    const mine = isTextField(field) && scroller.contains(field);
    if (window.scrollY > 0) {
      pinning = true;
      window.scrollTo(0, 0);
      pinning = false;
    }
    const height = keyboardHeight();
    const room = height >= KEYBOARD_MIN_PX ? height : 0;
    applyRoom(room);
    if (!room || !lift || !next || !mine) {
      retries = 0;
      return;
    }
    void scroller.scrollHeight;
    const covered = field.getBoundingClientRect().bottom - (next.height - KEYBOARD_GAP_PX);
    if (covered <= 2) {
      retries = 0;
      return;
    }
    const top = scroller.scrollTop;
    scroller.scrollTop = top + covered;
    if (scroller.scrollTop < top + covered - 1 && retries < 3) {
      retries += 1;
      requestAnimationFrame(() => place(true));
    } else {
      retries = 0;
    }
  };

  const onFocus = (event: FocusEvent) => {
    if (!isTextField(event.target) || !scroller.contains(event.target as Node)) return;
    const next = window.visualViewport;
    if (next && baseline - next.height < 24) baseline = next.height;
    window.clearTimeout(timer);
    window.clearTimeout(follow);
    place(true);
    timer = window.setTimeout(() => place(true), 320);
    follow = window.setTimeout(() => place(true), 700);
  };

  scroller.addEventListener("focusin", onFocus);
  const onViewport = () => place(true);
  viewport?.addEventListener("resize", onViewport);
  viewport?.addEventListener("scroll", onViewport);

  return () => {
    scroller.removeEventListener("focusin", onFocus);
    viewport?.removeEventListener("resize", onViewport);
    viewport?.removeEventListener("scroll", onViewport);
    window.clearTimeout(timer);
    window.clearTimeout(follow);
    applyRoom(0);
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
