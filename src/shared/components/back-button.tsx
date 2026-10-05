"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

/** Chevron tip in the 22px svg sits 7.3px in (vertex at x=8, stroke 1.4). */
const ARROW_TIP_INSET_PX = 7.3;

type BackButtonProps = {
  /** Where to go when this page was opened directly and there is no previous screen. */
  fallbackHref: string;
  /** Stay on this page and step back inside it. History is used when this is absent. */
  onBack?: () => void;
};

const SHOW_MS = 150;
const HIDE_MS = 240;
const IDLE_MS = 150;
const MOVE_PX = 8;

/**
 * The only back control. Same place on every nested page: the profile chevron,
 * fixed at the top-left. Page padding does not move it. Pages only pad their
 * content so it stays clear of the arrow.
 * A scroll, or a touch that moves, fades the arrow. It returns when the motion stops.
 */
export function BackButton({ fallbackHref, onBack }: BackButtonProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenRef = useRef(false);
  const [hidden, setHidden] = useState(false);
  const [reduce, setReduce] = useState(false);

  const go = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduce) {
      hiddenRef.current = false;
      setHidden(false);
      return;
    }

    const clearIdle = () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      idleRef.current = null;
    };

    const moving = () => {
      if (!hiddenRef.current) {
        hiddenRef.current = true;
        setHidden(true);
      }
      clearIdle();
      idleRef.current = setTimeout(() => {
        hiddenRef.current = false;
        setHidden(false);
      }, IDLE_MS);
    };

    let origin: { x: number; y: number } | null = null;
    const onScroll = () => moving();
    const onPointerDown = (event: PointerEvent) => {
      if (buttonRef.current?.contains(event.target as Node)) return;
      origin = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy < MOVE_PX * MOVE_PX) return;
      moving();
    };
    const onPointerUp = () => {
      origin = null;
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerUp, { capture: true });
    return () => {
      clearIdle();
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointermove", onPointerMove, { capture: true });
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.removeEventListener("pointercancel", onPointerUp, { capture: true });
    };
  }, [reduce]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="Back"
      onClick={go}
      className="fixed z-30 flex w-11 items-center justify-start text-[#111]"
      style={{
        top: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`,
        left: `calc(var(--gutter) - ${ARROW_TIP_INSET_PX}px)`,
        height: HEADER_ROW_PX,
        opacity: reduce || !hidden ? 1 : 0,
        transition: reduce ? "none" : `opacity ${hidden ? HIDE_MS : SHOW_MS}ms ease`,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path
          d="M15 5l-7 7 7 7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
