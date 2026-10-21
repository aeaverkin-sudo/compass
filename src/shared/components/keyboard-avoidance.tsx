"use client";

import { useEffect } from "react";

const KEYBOARD_MIN_PX = 80;

function isField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return true;
  return node.isContentEditable;
}

/** How much of the previous block sits on top of the scrolling list. */
function headerCover(scroller: HTMLElement) {
  const previous = scroller.previousElementSibling;
  if (!(previous instanceof HTMLElement)) return 0;
  const overlap = previous.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top;
  return overlap > 0 ? overlap : 0;
}

function fitScreen(main: HTMLElement) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const keyboard = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
  if (keyboard <= KEYBOARD_MIN_PX) {
    main.style.top = "";
    main.style.height = "";
    main.style.bottom = "";
    return;
  }
  main.style.top = `${viewport.offsetTop}px`;
  main.style.height = `${viewport.height}px`;
  main.style.bottom = "auto";
}

/**
 * The open keyboard shrinks the fixed screen to the visible area.
 * A field in the list scrolls into that list. The name in the header is already on screen.
 */
export function KeyboardAvoidance() {
  useEffect(() => {
    let active: HTMLElement | null = null;

    const place = () => {
      const field = active && document.contains(active) ? active : null;
      const main = field?.closest("main") ?? document.querySelector("main.compass-main");
      if (main instanceof HTMLElement) fitScreen(main);
      const scroller = field?.closest(".compass-card-scroll");
      if (!(scroller instanceof HTMLElement)) return;
      const cover = headerCover(scroller);
      scroller.style.scrollPaddingTop = cover > 0 ? `${Math.round(cover)}px` : "0px";
      scroller.style.scrollPaddingBottom = "8px";
      field?.scrollIntoView({ block: "nearest" });
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      active = event.target;
      place();
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        const next = document.activeElement;
        if (isField(next)) {
          active = next;
          return;
        }
        active = null;
      }, 60);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      const main = document.querySelector("main.compass-main");
      if (main instanceof HTMLElement) {
        main.style.top = "";
        main.style.height = "";
        main.style.bottom = "";
      }
    };
  }, []);

  return null;
}
