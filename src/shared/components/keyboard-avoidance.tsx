"use client";

import { useEffect } from "react";

function isField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node.isContentEditable;
}

/** A field under the keyboard scrolls into view. One that is already visible stays. */
export function KeyboardAvoidance() {
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const field = event.target;
      if (!isField(field) || !field.closest(".compass-card-scroll")) return;
      const run = () => field.scrollIntoView({ block: "nearest" });
      const viewport = window.visualViewport;
      if (!viewport) {
        window.setTimeout(run, 300);
        return;
      }
      let timer = 0;
      const done = () => {
        window.clearTimeout(timer);
        viewport.removeEventListener("resize", done);
        run();
      };
      viewport.addEventListener("resize", done);
      timer = window.setTimeout(done, 300);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
